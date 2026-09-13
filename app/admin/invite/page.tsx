import { SignupForm } from '@/components/SignupForm';
import { AuthBranding } from '@/components/AuthBranding';

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string }> }) {
  const { token, email } = await searchParams;
  return <main className="authShell"><AuthBranding /><section className="authCard"><SignupForm invitationToken={token || ''} invitedEmail={email || ''} /></section></main>;
}
