import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData, SubjectProgress } from "./storage";
import { emptySubject, loadData, saveData } from "./storage";

export function useAppData() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [saveError, setSaveError] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveError(!saveData(data));
  }, [data]);

  // 別タブでの更新を反映
  useEffect(() => {
    const onStorage = () => setData(loadData());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSubject = useCallback(
    (id: string, fn: (s: SubjectProgress) => SubjectProgress) => {
      setData((d) => ({
        ...d,
        subjects: { ...d.subjects, [id]: fn(d.subjects[id] ?? emptySubject()) },
      }));
    },
    [],
  );

  return { data, setData, updateSubject, saveError };
}
