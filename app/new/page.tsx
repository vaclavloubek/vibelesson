import LessonWorkspace from '@/components/LessonWorkspace';

type Props = {
  searchParams: Promise<{ folder?: string | string[] }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function NewLessonPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawFolder = Array.isArray(params.folder) ? params.folder[0] : params.folder;
  const initialFolderId = rawFolder && UUID_PATTERN.test(rawFolder) ? rawFolder : null;
  return <LessonWorkspace initialFolderId={initialFolderId} />;
}
