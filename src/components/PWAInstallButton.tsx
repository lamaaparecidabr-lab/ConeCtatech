import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide
  if (isInstalled) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-[10px] font-bold text-emerald-400">
        <CheckCircle className="w-3 h-3" />
        <span>PWA Instalado</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold shadow-md shadow-orange-950/50 transition cursor-pointer"
        title="Instalar App no celular ou PC para uso offline na garagem"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold border border-neutral-700 transition cursor-pointer"
          title="Instalar no iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-orange-400" />
          <span>Instalar no iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-orange-500" />
                  Instalar no iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-neutral-300">
                <div className="flex items-start gap-2.5 bg-neutral-950/60 p-3 rounded-xl border border-neutral-800">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-600/30 text-orange-400 flex items-center justify-center text-xs font-bold">1</span>
                  <p>Abra esta página no <strong>Safari</strong> do seu iPhone.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-neutral-950/60 p-3 rounded-xl border border-neutral-800">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-600/30 text-orange-400 flex items-center justify-center text-xs font-bold">2</span>
                  <p>Toque no ícone de <strong>Compartilhar</strong> (quadrado com seta para cima).</p>
                </div>
                <div className="flex items-start gap-2.5 bg-neutral-950/60 p-3 rounded-xl border border-neutral-800">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-600/30 text-orange-400 flex items-center justify-center text-xs font-bold">3</span>
                  <p>Role a tela e toque em <strong>"Adicionar à Tela de Início"</strong>.</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-orange-600 hover:bg-orange-500 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
