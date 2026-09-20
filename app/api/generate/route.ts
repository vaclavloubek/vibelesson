import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createLesson, type LessonGenerationStage } from '@/lib/ai';
import { GradingStrictnessSchema } from '@/lib/schema';
import { getAuthenticatedUserId } from '@/lib/auth';
import { requireTrustedDeviceForPaidIndividual, trustedDeviceErrorMessage } from '@/lib/trusted-device-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLessonFolderEntitlement } from '@/lib/lesson-folders';
import { currentFreeDeviceBudgetHash, freeDeviceBudgetMessage } from '@/lib/free-device-budget';
import { LOCALE_REQUEST_HEADER, normalizeUiLocale } from '@/lib/i18n';
import {
  MATERIAL_MAX_FILES,
  MATERIAL_MAX_TEXT_PER_FILE,
  MATERIAL_MAX_TEXT_TOTAL,
  materialsToPrompt,
  type MaterialMode,
} from '@/lib/materials';

export const maxDuration = 300;

const MaterialSchema = z.object({
  name: z.string().min(1).max(255),
  text: z.string().min(1).max(MATERIAL_MAX_TEXT_PER_FILE + 100),
});

const InputSchema = z.object({
  prompt: z.string().max(5000).refine((value) => value.trim().length === 0 || value.trim().length >= 5),
  audience: z.string().min(1).max(200),
  duration: z.number().int().min(10).max(360),
  groupSize: z.string().min(1).max(100),
  tone: z.string().min(1).max(200),
  lessonLanguage: z.string().trim().min(1).max(100).default('auto'),
  uiLocale: z.enum(['cs', 'en']).default('cs'),
  gradingStrictness: GradingStrictnessSchema.default('neutral'),
  materialMode: z.enum(['primary', 'strict', 'inspiration']).default('primary'),
  materials: z.array(MaterialSchema).max(MATERIAL_MAX_FILES).default([]),
  folderId: z.string().uuid().nullable().optional().default(null),
});

type ReservationRow = {
  request_id: string | null;
  allowed: boolean;
  used: number;
  monthly_limit: number | null;
  denial_code?: string | null;
  device_used?: number | null;
  device_limit?: number | null;
};

type ProgressEvent =
  | { type: 'progress'; stage: LessonGenerationStage | 'saving' }
  | { type: 'result'; lesson: unknown; lessonId: string }
  | { type: 'error'; error: string };

export async function POST(req: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Pro AI generování se nejdřív přihlas.' }, { status: 401 });
  }

  const deviceGate = await requireTrustedDeviceForPaidIndividual(userId);
  if (!deviceGate.allowed) {
    return NextResponse.json({ error: trustedDeviceErrorMessage(deviceGate.code), code: deviceGate.code }, { status: 403 });
  }

  let requestId: string | null = null;

  try {
    const input = InputSchema.parse(await req.json());

    if (!input.prompt.trim() && input.materials.length === 0) {
      return NextResponse.json({ error: 'Popiš hodinu nebo nahraj alespoň jeden podklad.' }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, ai_grading_enabled, multilingual_lessons_enabled')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const isAdmin = profile?.role === 'admin';
    const aiGradingEnabled = Boolean(profile && (isAdmin || profile.ai_grading_enabled));
    const multilingualLessonsEnabled = Boolean(profile && (isAdmin || profile.multilingual_lessons_enabled));
    const requestLocale = normalizeUiLocale(req.headers.get(LOCALE_REQUEST_HEADER)) ?? input.uiLocale;

    if (!multilingualLessonsEnabled
      && input.lessonLanguage !== 'auto'
      && input.lessonLanguage !== requestLocale) {
      return NextResponse.json({
        error: 'Lekce v jiném jazyce jsou dostupné v placených tarifech.',
      }, { status: 403 });
    }

    const effectiveLessonLanguage = multilingualLessonsEnabled
      ? input.lessonLanguage
      : requestLocale;

    if (input.gradingStrictness !== 'neutral' && !aiGradingEnabled) {
      return NextResponse.json({ error: 'Nastavení přísnosti AI hodnocení není pro tento tarif dostupné.' }, { status: 403 });
    }

    const totalMaterialText = input.materials.reduce((sum, material) => sum + material.text.length, 0);
    if (totalMaterialText > MATERIAL_MAX_TEXT_TOTAL + (input.materials.length * 100)) {
      return NextResponse.json({ error: 'Extrahovaný obsah podkladů je příliš dlouhý.' }, { status: 400 });
    }

    if (input.folderId) {
      const entitlement = await getLessonFolderEntitlement(supabase, userId);
      if (!entitlement.enabled) {
        return NextResponse.json({ error: 'Ukládání do složek je dostupné v nejvyšším tarifu.' }, { status: 403 });
      }
      const { data: folder, error: folderError } = await supabase
        .from('lesson_folders')
        .select('id')
        .eq('id', input.folderId)
        .eq('owner_id', userId)
        .maybeSingle();
      if (folderError) throw folderError;
      if (!folder) return NextResponse.json({ error: 'Vybraná složka nebyla nalezena.' }, { status: 404 });
    }

    const materialText = materialsToPrompt(input.materials);

    const admin = createAdminClient();
    const deviceHash = await currentFreeDeviceBudgetHash();
    const { data, error: reserveError } = await admin.rpc('reserve_lesson_generation_server', {
      p_user_id: userId,
      p_device_token_hash: deviceHash,
    });
    if (reserveError) throw reserveError;

    const reservation = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
    if (!reservation) throw new Error('Quota reservation returned no data.');

    if (!reservation.allowed) {
      const deviceMessage = freeDeviceBudgetMessage(
        reservation.denial_code,
        'lesson',
        reservation.device_limit,
      );
      if (deviceMessage) {
        return NextResponse.json({
          error: deviceMessage,
          code: reservation.denial_code,
          deviceQuota: {
            used: reservation.device_used ?? reservation.device_limit ?? 10,
            limit: reservation.device_limit ?? 10,
            remaining: 0,
          },
        }, { status: reservation.denial_code === 'free_device_cookie_required' ? 409 : 429 });
      }

      return NextResponse.json({
        error: `Měsíční limit ${reservation.monthly_limit ?? 5} lekcí je vyčerpaný. Další lekci můžeš vytvořit příští měsíc.`,
        quota: {
          used: reservation.used,
          monthlyLimit: reservation.monthly_limit,
          remaining: 0,
        },
      }, { status: 429 });
    }

    requestId = reservation.request_id;
    if (!requestId) throw new Error('Quota reservation is missing request id.');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let streamClosed = false;

        const send = (event: ProgressEvent) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            streamClosed = true;
          }
        };

        const close = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // The client may have disconnected while generation continued.
          }
        };

        void (async () => {
          let costUsd: number | null = null;
          try {
            const generated = await createLesson({
              prompt: input.prompt,
              audience: input.audience,
              duration: input.duration,
              groupSize: input.groupSize,
              tone: input.tone,
              lessonLanguage: effectiveLessonLanguage,
              uiLocale: requestLocale,
              gradingStrictness: input.gradingStrictness,
              materialText,
              materialMode: input.materialMode as MaterialMode,
            }, (stage) => send({ type: 'progress', stage }));
            const lesson = generated.lesson;
            costUsd = generated.costUsd;

            send({ type: 'progress', stage: 'saving' });
            const { data: savedLesson, error: saveError } = await admin
              .from('lessons')
              .insert({
                owner_id: userId,
                title: lesson.title,
                source_prompt: input.prompt,
                lesson,
                folder_id: input.folderId,
              })
              .select('id')
              .single();

            if (saveError || !savedLesson?.id) {
              throw saveError ?? new Error('Generated lesson was not persisted.');
            }

            const lessonId = savedLesson.id as string;
            const { error: finishError } = await supabase.rpc('finish_generation_request', {
              p_request_id: requestId,
              p_status: 'succeeded',
              p_cost_usd: costUsd,
              p_lesson_id: lessonId,
            });
            if (finishError) console.error('finish generation request failed', finishError);

            send({ type: 'result', lesson, lessonId });
          } catch (error) {
            const { error: finishError } = await supabase.rpc('finish_generation_request', {
              p_request_id: requestId,
              p_status: 'failed',
              p_cost_usd: costUsd,
              p_lesson_id: null,
            });
            if (finishError) console.error('mark generation request failed', finishError);

            console.error('generate lesson failed', error);
            send({ type: 'error', error: 'Lekci se nepodařilo vygenerovat a bezpečně uložit. Zkus to prosím znovu.' });
          } finally {
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (error) {
    if (requestId) {
      const { error: finishError } = await supabase.rpc('finish_generation_request', {
        p_request_id: requestId,
        p_status: 'failed',
        p_cost_usd: null,
        p_lesson_id: null,
      });
      if (finishError) console.error('mark generation request failed', finishError);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Zkontroluj zadání lekce a zkus to znovu.' }, { status: 400 });
    }

    console.error('prepare lesson generation failed', error);
    return NextResponse.json({ error: 'Generování se nepodařilo spustit. Zkus to prosím znovu.' }, { status: 500 });
  }
}
