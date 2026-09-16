import { redirect } from 'next/navigation';
import StudentJoinForm from '@/components/StudentJoinForm';

type Props = { params: Promise<{ code: string }> };

export default async function JoinByCodePage({ params }: Props) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{7}$/.test(normalized)) redirect('/join');
  return <StudentJoinForm joinCode={normalized} />;
}
