'use client';

import { useCallback, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import AuthControls from '@/components/AuthControls';
import PublicHeaderAccountMenu from '@/components/PublicHeaderAccountMenu';

type Props = {
  onAuthChange?: (user: User | null) => void;
  quotaRefreshKey?: number;
  initialOpen?: boolean;
  initialMode?: 'signin' | 'signup';
};

export default function HeaderAccountSlot({
  onAuthChange,
  quotaRefreshKey = 0,
  initialOpen = false,
  initialMode = 'signin',
}: Props) {
  const [user, setUser] = useState<User | null>(null);

  const handleAuthChange = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    onAuthChange?.(nextUser);
  }, [onAuthChange]);

  return (
    <div className="header-auth-slot">
      <AuthControls
        onAuthChange={handleAuthChange}
        quotaRefreshKey={quotaRefreshKey}
        initialOpen={initialOpen}
        initialMode={initialMode}
      />
      {user ? <PublicHeaderAccountMenu user={user} quotaRefreshKey={quotaRefreshKey} /> : null}
    </div>
  );
}
