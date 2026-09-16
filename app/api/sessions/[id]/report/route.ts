import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/auth';
import { StudentAnswerSchema, TeamAnswerSchema } from '@/lib/live';
import { LessonSchema } from '@/lib/schema';
import type { SessionReportBlock, SessionReportData } from '@/lib/session-report';

type RouteContext = { params: Promise<{ id: string }> };

function durationSeconds(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 1000);
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Nejdřív se přihlas.' }, { status: 401 });

  const { id } = await params;
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, lesson_id, teacher_id, join_code, status, lesson_snapshot, started_at, ended_at, revealed_block_ids')
    .eq('id', id)
    .eq('teacher_id', userId)
    .single();

  if (sessionError || !session) return NextResponse.json({ error: 'Hodina nebyla nalezena.' }, { status: 404 });
  if (session.status !== 'ended') return NextResponse.json({ ready: false });

  const lesson = LessonSchema.safeParse(session.lesson_snapshot);
  if (!lesson.success) return NextResponse.json({ error: 'Snapshot lekce je neplatný.' }, { status: 500 });

  const [participantsResult, teamsResult, responsesResult, teamResponsesResult] = await Promise.all([
    supabase.from('participants').select('id, display_name, joined_at, team_id').eq('session_id', id).order('joined_at', { ascending: true }),
    supabase.from('teams').select('id, name, sort_order').eq('session_id', id).order('sort_order', { ascending: true }),
    supabase.from('responses').select('participant_id, block_id, answer, updated_at').eq('session_id', id).order('updated_at', { ascending: true }),
    supabase.from('team_responses').select('team_id, block_id, answer, updated_by_participant_id, updated_at').eq('session_id', id).order('updated_at', { ascending: true }),
  ]);

  if (participantsResult.error || teamsResult.error || responsesResult.error || teamResponsesResult.error) {
    console.error('session report load failed', {
      participants: participantsResult.error,
      teams: teamsResult.error,
      responses: responsesResult.error,
      teamResponses: teamResponsesResult.error,
    });
    return NextResponse.json({ error: 'Výsledky hodiny se nepodařilo načíst.' }, { status: 500 });
  }

  const participantRows = participantsResult.data ?? [];
  const teamRows = teamsResult.data ?? [];
  const responseRows = responsesResult.data ?? [];
  const teamResponseRows = teamResponsesResult.data ?? [];
  const teamNames = new Map(teamRows.map((team) => [team.id as string, team.name as string]));
  const participantNames = new Map(participantRows.map((participant) => [participant.id as string, participant.display_name as string]));
  const revealedBlockIds = new Set((session.revealed_block_ids ?? []) as string[]);

  const participants = participantRows.map((participant) => ({
    id: participant.id as string,
    displayName: participant.display_name as string,
    joinedAt: participant.joined_at as string,
    teamId: participant.team_id as string | null,
    teamName: participant.team_id ? teamNames.get(participant.team_id as string) ?? null : null,
  }));

  const blocks: SessionReportBlock[] = [];

  lesson.data.blocks.forEach((block, index) => {
    const blockIndex = index + 1;

    if (block.type === 'poll' || block.type === 'quiz') {
      const responses = responseRows.flatMap((row) => {
        if (row.block_id !== block.id) return [];
        const parsed = StudentAnswerSchema.safeParse(row.answer);
        if (!parsed.success || !('choice' in parsed.data)) return [];
        const choice = parsed.data.choice;
        return [{
          participantId: row.participant_id as string,
          displayName: participantNames.get(row.participant_id as string) ?? 'Student',
          choice,
          ...(block.type === 'quiz' ? { isCorrect: choice === block.correctAnswer } : {}),
        }];
      });

      blocks.push({
        kind: 'choice',
        blockId: block.id,
        blockIndex,
        type: block.type,
        title: block.title,
        responseCount: responses.length,
        revealed: revealedBlockIds.has(block.id),
        options: (block.options ?? []).map((option) => ({
          option,
          count: responses.filter((response) => response.choice === option).length,
        })),
        ...(block.type === 'quiz'
          ? {
              correctAnswer: block.correctAnswer,
              correctCount: responses.filter((response) => response.isCorrect).length,
            }
          : {}),
        responses,
      });
      return;
    }

    if (block.type === 'open_text' || block.type === 'exit_ticket') {
      const responses = responseRows.flatMap((row) => {
        if (row.block_id !== block.id) return [];
        const parsed = StudentAnswerSchema.safeParse(row.answer);
        if (!parsed.success || !('text' in parsed.data) || 'ranking' in parsed.data) return [];
        return [{
          participantId: row.participant_id as string,
          displayName: participantNames.get(row.participant_id as string) ?? 'Student',
          text: parsed.data.text,
        }];
      });

      blocks.push({
        kind: 'text',
        blockId: block.id,
        blockIndex,
        type: block.type,
        title: block.title,
        responseCount: responses.length,
        responses,
      });
      return;
    }

    if (block.type === 'ranking') {
      const responses = responseRows.flatMap((row) => {
        if (row.block_id !== block.id) return [];
        const parsed = StudentAnswerSchema.safeParse(row.answer);
        if (!parsed.success || !('ranking' in parsed.data)) return [];
        return [{
          participantId: row.participant_id as string,
          displayName: participantNames.get(row.participant_id as string) ?? 'Student',
          ranking: parsed.data.ranking,
          text: parsed.data.text,
        }];
      });

      const ranking = (block.items ?? []).map((item, sourceIndex) => {
        const positions = responses
          .map((response) => response.ranking.indexOf(item))
          .filter((position) => position >= 0)
          .map((position) => position + 1);
        return {
          item,
          sourceIndex,
          average: positions.length ? positions.reduce((sum, position) => sum + position, 0) / positions.length : null,
        };
      }).sort((a, b) => (a.average ?? Number.POSITIVE_INFINITY) - (b.average ?? Number.POSITIVE_INFINITY));

      blocks.push({
        kind: 'ranking',
        blockId: block.id,
        blockIndex,
        type: 'ranking',
        title: block.title,
        responseCount: responses.length,
        ranking,
        responses,
      });
      return;
    }

    if (block.type === 'team_task') {
      const savedResponses = new Map(teamResponseRows.flatMap((row) => {
        if (row.block_id !== block.id) return [];
        const parsed = TeamAnswerSchema.safeParse(row.answer);
        if (!parsed.success) return [];
        const updaterId = row.updated_by_participant_id as string | null;
        return [[row.team_id as string, {
          text: parsed.data.text,
          updatedByDisplayName: updaterId ? participantNames.get(updaterId) ?? 'Student' : null,
        }] as const];
      }));

      const responses = teamRows.map((team) => {
        const saved = savedResponses.get(team.id as string);
        return {
          teamId: team.id as string,
          teamName: team.name as string,
          text: saved?.text ?? null,
          updatedByDisplayName: saved?.updatedByDisplayName ?? null,
        };
      });

      blocks.push({
        kind: 'team',
        blockId: block.id,
        blockIndex,
        type: 'team_task',
        title: block.title,
        responseCount: responses.filter((response) => response.text !== null).length,
        responses,
      });
    }
  });

  const report: SessionReportData = {
    sessionId: session.id as string,
    lessonId: session.lesson_id as string | null,
    title: lesson.data.title,
    joinCode: session.join_code as string,
    startedAt: session.started_at as string | null,
    endedAt: session.ended_at as string | null,
    durationSeconds: durationSeconds(session.started_at as string | null, session.ended_at as string | null),
    participantCount: participants.length,
    interactiveBlockCount: blocks.length,
    answeredBlockCount: blocks.filter((block) => block.responseCount > 0).length,
    totalResponses: blocks.reduce((sum, block) => sum + block.responseCount, 0),
    participants,
    blocks,
  };

  return NextResponse.json({ ready: true, report });
}
