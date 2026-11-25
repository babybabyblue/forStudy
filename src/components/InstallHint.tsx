import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

const KEY = "kantei-study:install-hint-dismissed";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** ホーム画面への追加の案内（アプリとして起動していないときだけ表示） */
export function InstallHint({ always = false }: { always?: boolean }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (isStandalone() || (dismissed && !always)) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* noop */
    }
  };

  return (
    <section className="panel install">
      <strong>📲 ホーム画面に追加して使おう</strong>
      {evt ? (
        <p className="small">
          アプリとして追加すると、オフラインでも使えて学習記録も消えにくくなります。
          <br />
          <button className="btn primary small" onClick={() => evt.prompt()}>
            ホーム画面に追加
          </button>
        </p>
      ) : isIOS() ? (
        <p className="small">
          Safari の下の <b>共有ボタン（□↑）</b> →「<b>ホーム画面に追加</b>」をタップ。
          ホーム画面のアイコンから開くと、オフラインでも使えて学習記録も消えにくくなります。
        </p>
      ) : (
        <p className="small">
          ブラウザのメニュー（︙）→「<b>ホーム画面に追加</b>」または「<b>アプリをインストール</b>」。
          オフラインでも使えて、学習記録も消えにくくなります。
        </p>
      )}
      {!always && (
        <button className="btn ghost small" onClick={close}>
          閉じる
        </button>
      )}
    </section>
  );
}
