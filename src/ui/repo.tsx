import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { openAppDb } from '../db/db';
import { migrate } from '../db/migrations';
import { initRepository, type Repository } from '../db/repository';

const RepoContext = createContext<Repository | null>(null);

/** Opens the phone database once and shares the repository with every screen. */
export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await openAppDb();
      await migrate(db);
      const { randomUUID } = await import('expo-crypto');
      if (alive) setRepo(initRepository(db, () => randomUUID()));
    })().catch((e) => {
      console.error('database init failed', e);
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>No se pudo abrir la base de datos. Reinicia la app.</Text>
      </View>
    );
  }
  return <RepoContext.Provider value={repo}>{children}</RepoContext.Provider>;
}

/** The repository, or null while the database is opening. */
export function useRepo(): Repository | null {
  return useContext(RepoContext);
}

/** Re-renders the caller on every data change. */
export function useRepoVersion(repo: Repository | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!repo) return;
    return repo.subscribe(() => setVersion((v) => v + 1));
  }, [repo]);
  return version;
}
