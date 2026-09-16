import StudentSession from '@/components/StudentSession';

type Props = { params: Promise<{ id: string }> };

export default async function StudentSessionPage({ params }: Props) {
  const { id } = await params;
  return <StudentSession sessionId={id} />;
}
