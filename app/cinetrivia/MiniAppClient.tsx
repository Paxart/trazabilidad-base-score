"use client";

import React, { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { trivias } from "./data";
import type { TriviaDefinition, SupportedLanguage } from "./data/types";

type Phase = "library" | "language" | "playing" | "finished" | "ranking";

type MiniAppUser = {
  fid?: number;
  address?: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
};

type RankingEntry = {
  id: number;
  triviaId: string;
  score: number;
  fid?: number;
  address?: string;
  username?: string | null;
  displayName?: string | null;
  pfpUrl?: string | null;
  createdAt?: string;
};

const DEFAULT_LANGUAGE: SupportedLanguage = "es";
const HOME_URL = "https://how-famous-are-you.vercel.app/cinetrivia";

export default function MiniAppClient() {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<MiniAppUser | null>(null);
  const [phase, setPhase] = useState<Phase>("library");
  const [selectedTrivia, setSelectedTrivia] = useState<TriviaDefinition | null>(null);
  const [language, setLanguage] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [hasSentScore, setHasSentScore] = useState(false);

  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  // ---------------------------------------------------------------------------
  // Inicialización segura
  // ---------------------------------------------------------------------------
useEffect(() => {
  let cancelled = false;

  const init = async () => {
    try {
      let ctx: any = null;

      try {
        const timeout = new Promise((resolve) =>
          setTimeout(() => resolve(null), 1200)
        );

        ctx = await Promise.race([
          sdk?.context,
          timeout,
        ]);

        if (!cancelled && ctx?.user) {
          setUser({
            fid: ctx.user.fid,
            username: ctx.user.username,
            displayName: ctx.user.displayName,
            pfpUrl: ctx.user.pfpUrl,
          });
        }
      } catch (err) {
        console.warn("No Farcaster/Base context:", err);
      }

      // 🔥 ESTO ES LO CRÍTICO
      try {
        await sdk?.actions?.ready?.();
      } catch (err) {
        console.warn("ready() fallback:", err);
      }

    } catch (err) {
      console.error("Error inicializando:", err);
    } finally {
      if (!cancelled) setIsReady(true);
    }
  };

  init();

  return () => {
    cancelled = true;
  };
}, []);
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const currentQuestion = selectedTrivia?.questions[currentIndex] ?? null;

  const resetStateForTrivia = (trivia: TriviaDefinition | null) => {
    setSelectedTrivia(trivia);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setHasSentScore(false);
    setTimeLeft(null);
    setPhase(trivia ? "language" : "library");
  };

  const handleSelectTrivia = (trivia: TriviaDefinition) => {
    resetStateForTrivia(trivia);
  };

  const handleSelectLanguage = (lang: SupportedLanguage) => {
    if (!selectedTrivia) return;
    setLanguage(lang);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setHasSentScore(false);

    const total = selectedTrivia.questions.length;
    const initialSeconds = total > 10 ? 120 : 60;

    setTimeLeft(initialSeconds);
    setPhase("playing");
  };

  const handlePickOption = (idx: number) => {
    if (!currentQuestion) return;
    if (selectedIndex !== null || phase !== "playing") return;
    if (timeLeft !== null && timeLeft <= 0) return;

    setSelectedIndex(idx);

    const isCorrect = idx === currentQuestion.correctIndex;
    if (isCorrect) setScore((s) => s + 1);
  };

  const handleNextQuestion = () => {
    if (!selectedTrivia) return;

    const total = selectedTrivia.questions.length;
    if (currentIndex + 1 >= total) {
      setPhase("finished");
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedIndex(null);
    }
  };

  const getRankForScore = () => {
    if (!selectedTrivia) return null;
    const ranksSorted = [...selectedTrivia.ranks].sort(
      (a, b) => b.minScore - a.minScore
    );
    return ranksSorted.find((r) => score >= r.minScore) ?? null;
  };

  const connectWallet = async () => {
    try {
      if (!connectors || connectors.length === 0) {
        alert(
          language === "es"
            ? "No se encontró ningún conector de wallet."
            : "No wallet connector was found."
        );
        return;
      }

      await connect({ connector: connectors[0] });
    } catch (err) {
      console.error("Error conectando wallet:", err);
    }
  };

  // ---------------------------------------------------------------------------
  // Guardar puntuación
  // ---------------------------------------------------------------------------
  const saveScoreToServer = async () => {
    if (!selectedTrivia || hasSentScore) return;
    if (!user?.address && !user?.fid) return;

    try {
      await fetch("/api/cinetrivia/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: user?.address,
          fid: user?.fid,
          username: user?.username,
          displayName: user?.displayName,
          pfpUrl: user?.pfpUrl,
          triviaId: selectedTrivia.id,
          score,
        }),
      });

      setHasSentScore(true);
    } catch (err) {
      console.error("Error guardando puntuación en el servidor:", err);
    }
  };

  const handleShareScore = async () => {
    if (!selectedTrivia) return;

    const total = selectedTrivia.questions.length;
    const rank = getRankForScore();
    const name =
      user?.displayName ||
      user?.username ||
      (language === "es" ? "un cinéfilo" : "a movie fan");

    const triviaTitle = selectedTrivia.title[language] ?? "Farlander Trivia";
    const rankTitle =
      rank?.title[language] ??
      (language === "es" ? "Aspirante" : "Contender");

    const text =
      language === "es"
        ? `${name} ha conseguido el rango "${rankTitle}" en ${triviaTitle} con ${score}/${total} 🎬✨\n\n¿Te atreves a mejorar esa puntuación?\n${HOME_URL}`
        : `${name} has reached the "${rankTitle}" rank in ${triviaTitle} with ${score}/${total} 🎬✨\n\nCan you beat that score?\n${HOME_URL}`;

    try {
      await saveScoreToServer();

      if (navigator.share) {
        await navigator.share({
          title: "Farlander CineTrivia",
          text,
          url: HOME_URL,
        });
        return;
      }

      await navigator.clipboard.writeText(text);
      alert(
        language === "es"
          ? "Texto copiado para compartir."
          : "Copied to clipboard."
      );
    } catch (err) {
      console.error("Error compartiendo puntuación:", err);
    }
  };

  const handlePlayAgain = () => {
    if (!selectedTrivia) return;

    setCurrentIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setHasSentScore(false);

    const total = selectedTrivia.questions.length;
    const initialSeconds = total > 10 ? 120 : 60;
    setTimeLeft(initialSeconds);
    setPhase("playing");
  };

  const handleBackToLibrary = () => {
    setSelectedTrivia(null);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setTimeLeft(null);
    setHasSentScore(false);
    setPhase("library");
  };

  const handleAddToMyApps = async () => {
    alert(
      language === "es"
        ? "Ahora la integración va por Base.dev. La app debe registrarse allí en lugar de usar addMiniApp()."
        : "Now the integration goes through Base.dev. The app should be registered there instead of using addMiniApp()."
    );
  };

  const handleOpenRanking = async () => {
    if (!selectedTrivia) return;

    try {
      await saveScoreToServer();
    } catch (err) {
      console.error("Error guardando puntuación antes de abrir ranking:", err);
    }

    setPhase("ranking");
  };

  const handleOpenRankingFromLibrary = (trivia: TriviaDefinition) => {
    setSelectedTrivia(trivia);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setScore(0);
    setHasSentScore(false);
    setTimeLeft(null);
    setPhase("ranking");
  };

  // ---------------------------------------------------------------------------
  // Estilos
  // ---------------------------------------------------------------------------
  const wrapper: React.CSSProperties = {
    width: "100%",
    minHeight: "100vh",
    background:
      selectedTrivia?.background ||
      "radial-gradient(circle at top, #1b0b07 0%, #09010a 45%, #000000 100%)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "16px 8px",
    boxSizing: "border-box",
    color: "#ffffff",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  };

  const column: React.CSSProperties = {
    width: "100%",
    maxWidth: 380,
    margin: "0 auto",
  };

  const card: React.CSSProperties = {
    width: "100%",
    backgroundColor: "rgba(10,16,30,0.96)",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 18px 45px rgba(0,0,0,0.8)",
    border: "1px solid rgba(148,163,184,0.3)",
    backdropFilter: "blur(14px)",
    boxSizing: "border-box",
  };

  const mainButtonBase: React.CSSProperties = {
    width: "100%",
    marginTop: 10,
    padding: "11px 14px",
    borderRadius: 999,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center",
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (!isReady) {
    return (
      <div style={wrapper}>
        <div style={column}>
          <div style={card}>
            <p style={{ textAlign: "center" }}>
              Loading Farlander CineTrivia… 🎬
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Biblioteca
  // ---------------------------------------------------------------------------
  if (phase === "library") {
    const isSpanish = language === "es";

    return (
      <div style={wrapper}>
        <div style={column}>
          <div
            style={{
              width: "100%",
              marginBottom: 14,
              borderRadius: 24,
              padding: 14,
              boxSizing: "border-box",
              background:
                "linear-gradient(135deg, #1f1024 0%, #a8324a 40%, #f39c3d 100%)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 16px 40px rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                width: 70,
                height: 70,
                borderRadius: 20,
                overflow: "hidden",
                flexShrink: 0,
                border: "2px solid rgba(0,0,0,0.6)",
                backgroundColor: "#020617",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src="/cinetrivia/farlander_token.png"
                alt="CRIPTOSLIVE token"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {isSpanish
                  ? "El token para los amantes del cine."
                  : "The token for true cinema lovers."}
              </div>

              <button
                onClick={() =>
                  window.open("https://zora.co/@suilander", "_blank")
                }
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  background:
                    "linear-gradient(135deg, #f97316 0%, #ec4899 50%, #a855f7 100%)",
                  color: "#111827",
                  whiteSpace: "nowrap",
                }}
              >
                {isSpanish
                  ? "Comprar $CRIPTOSLIVE en Zora"
                  : "Buy $CRIPTOSLIVE on Zora"}
              </button>
            </div>
          </div>

          <div style={card}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {isSpanish ? "Biblioteca de trivias" : "Trivia Library"}
              </h2>

              <div
                style={{
                  display: "flex",
                  gap: 6,
                }}
              >
                <button
                  onClick={() => setLanguage("en")}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "999px",
                    border:
                      language === "en"
                        ? "2px solid #facc15"
                        : "1px solid rgba(148,163,184,0.4)",
                    backgroundColor:
                      language === "en" ? "#0f172a" : "transparent",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  GB
                </button>

                <button
                  onClick={() => setLanguage("es")}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "999px",
                    border:
                      language === "es"
                        ? "2px solid #f97316"
                        : "1px solid rgba(148,163,184,0.4)",
                    backgroundColor:
                      language === "es" ? "#0f172a" : "transparent",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ES
                </button>
              </div>
            </div>

            <p
              style={{
                fontSize: 13,
                opacity: 0.85,
                marginBottom: 14,
              }}
            >
              {isSpanish
                ? "Elige un trivial para empezar a jugar."
                : "Choose a trivia to start playing."}
            </p>

            <div style={{ marginBottom: 10 }}>
              {isConnected && address ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: "rgba(15,23,42,0.8)",
                    border: "1px solid rgba(148,163,184,0.4)",
                    fontSize: 13,
                  }}
                >
                  Wallet: {address.slice(0, 6)}...{address.slice(-4)}
                  <button
                    onClick={() => disconnect()}
                    style={{
                      marginLeft: 10,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {isSpanish ? "Desconectar" : "Disconnect"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  style={{
                    ...mainButtonBase,
                    marginTop: 0,
                    background:
                      "linear-gradient(135deg, #0052ff 0%, #38bdf8 100%)",
                    color: "#fff",
                  }}
                >
                  {isSpanish ? "Conectar wallet" : "Connect wallet"}
                </button>
              )}
            </div>

            <button
              onClick={handleAddToMyApps}
              style={{
                ...mainButtonBase,
                background:
                  "linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #fde047 100%)",
                color: "#111827",
                marginBottom: 10,
              }}
            >
              ⭐{" "}
              {isSpanish
                ? "Integración en Base.dev"
                : "Base.dev integration"}
            </button>

            {trivias.map((t) => (
              <div
                key={t.id}
                style={{
                  width: "100%",
                  marginBottom: 10,
                  borderRadius: 18,
                  border: "1px solid rgba(56,189,248,0.6)",
                  background:
                    "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(8,16,36,0.7))",
                  boxSizing: "border-box",
                  padding: "9px 11px",
                }}
              >
                <button
                  onClick={() => handleSelectTrivia(t)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    margin: 0,
                  }}
                >
                  <img
                    src={t.coverImageUrl}
                    alt={t.title[language]}
                    width={40}
                    height={40}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.5)",
                      objectFit: "cover",
                      backgroundColor: "#020617",
                    }}
                  />
                  <div
                    style={{
                      textAlign: "left",
                      flex: 1,
                      color: "#e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {t.title[language]}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      {t.description[language]}
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleOpenRankingFromLibrary(t)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.7)",
                    backgroundColor: "rgba(15,23,42,0.8)",
                    color: "#e5e7eb",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  🏆{" "}
                  {isSpanish
                    ? "Ver ranking de este quiz"
                    : "View this quiz leaderboard"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Selector de idioma
  // ---------------------------------------------------------------------------
  if (phase === "language" && selectedTrivia) {
    return (
      <div style={wrapper}>
        <div style={column}>
          <div style={card}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <img
                src={selectedTrivia.coverImageUrl}
                alt={selectedTrivia.title.es}
                width={64}
                height={64}
                style={{
                  borderRadius: 20,
                  border: "1px solid rgba(148,163,184,0.5)",
                  objectFit: "cover",
                  marginBottom: 8,
                  backgroundColor: "#020617",
                }}
              />
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {selectedTrivia.title.es}
              </div>
            </div>

            <p
              style={{
                fontSize: 13,
                textAlign: "center",
                opacity: 0.85,
                marginBottom: 14,
              }}
            >
              Choose your language / Elige tu idioma
            </p>

            <button
              onClick={() => handleSelectLanguage("en")}
              style={{
                ...mainButtonBase,
                background:
                  "linear-gradient(135deg, #1d4ed8 0%, #38bdf8 50%, #a855f7 100%)",
                color: "#0f172a",
              }}
            >
              🇬🇧 English
            </button>

            <button
              onClick={() => handleSelectLanguage("es")}
              style={{
                ...mainButtonBase,
                background: "transparent",
                border: "1px solid rgba(249,115,22,0.9)",
                color: "#f97316",
              }}
            >
              🇪🇸 Español
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Juego
  // ---------------------------------------------------------------------------
  if (phase === "playing" && selectedTrivia && currentQuestion) {
    const totalQuestions = selectedTrivia.questions.length;
    const isTarantino = selectedTrivia.id === "tarantino";
    const langOptions = (currentQuestion.options as any)[language] as string[];

    return (
      <div style={wrapper}>
        <div style={column}>
          <div style={card}>
            {isTarantino && (
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background:
                      "linear-gradient(90deg,#111827,#7f1d1d,#b91c1c,#ef4444)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      right: 12,
                      top: -4,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#b91c1c",
                      boxShadow: "0 0 10px rgba(248,113,113,0.8)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: 26,
                      top: -2,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#7f1d1d",
                    }}
                  />
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 12,
                gap: 10,
              }}
            >
              <img
                src={selectedTrivia.coverImageUrl}
                alt={selectedTrivia.title[language]}
                width={42}
                height={42}
                style={{
                  borderRadius: 12,
                  border: "1px solid #111827",
                  backgroundColor: "#020617",
                }}
              />

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    opacity: 0.75,
                  }}
                >
                  {selectedTrivia.title[language]}
                </div>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  {language === "es" ? "Pregunta" : "Question"} {currentIndex + 1} /{" "}
                  {totalQuestions} · {language === "es" ? "Puntuación" : "Score"}:{" "}
                  {score}
                  {isTarantino && " 🩸"}
                </div>
              </div>

              {timeLeft !== null && (
                <div
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.5)",
                    fontSize: 12,
                    fontWeight: 600,
                    backgroundColor: timeLeft <= 10 ? "#7f1d1d" : "#020617",
                  }}
                >
                  ⏱ {formatTime(timeLeft)}
                </div>
              )}
            </div>

            {currentQuestion.imageUrl && (
              <div
                style={{
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <img
                  src={currentQuestion.imageUrl}
                  alt={currentQuestion.text[language]}
                  style={{
                    maxWidth: "100%",
                    borderRadius: 16,
                    border: isTarantino
                      ? "2px solid rgba(248,113,113,0.8)"
                      : "1px solid rgba(148,163,184,0.6)",
                    boxShadow: isTarantino
                      ? "0 0 25px rgba(248,113,113,0.35)"
                      : "0 0 18px rgba(15,23,42,0.8)",
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {currentQuestion.text[language]}
              </div>
            </div>

            {langOptions.map((opt, idx) => {
              const isSelectedOpt = selectedIndex === idx;
              const isCorrectOpt = idx === currentQuestion.correctIndex;
              let bg = "#111827";
              let color = "#e5e7eb";

              if (selectedIndex !== null) {
                if (isCorrectOpt) {
                  bg = "#22c55e";
                  color = "#052e16";
                } else if (isSelectedOpt && !isCorrectOpt) {
                  bg = "#ef4444";
                  color = "#450a0a";
                }
              } else if (isSelectedOpt) {
                bg = "#4b5563";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handlePickOption(idx)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    marginTop: 8,
                    borderRadius: 999,
                    border: "none",
                    textAlign: "left",
                    background: bg,
                    color,
                    fontSize: 15,
                    cursor: selectedIndex === null ? "pointer" : "default",
                  }}
                >
                  {opt}
                </button>
              );
            })}

            {selectedIndex !== null && (
              <button
                onClick={handleNextQuestion}
                style={{
                  ...mainButtonBase,
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #22c55e 50%, #0ea5e9 100%)",
                  color: "#0b1120",
                  marginTop: 16,
                }}
              >
                {currentIndex + 1 >= totalQuestions
                  ? language === "es"
                    ? "Ver mi puntuación final ▶️"
                    : "See my final score ▶️"
                  : language === "es"
                  ? "Siguiente pregunta ▶️"
                  : "Next question ▶️"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Ranking
  // ---------------------------------------------------------------------------
  if (phase === "ranking" && selectedTrivia) {
    const isSpanish = language === "es";
    let sorted: RankingEntry[] = [];
    let myPosition: number | null = null;

    if (ranking && ranking.length > 0) {
      sorted = [...ranking].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.createdAt && b.createdAt) {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return 0;
      });

      if (user) {
        const idx = sorted.findIndex((r) => {
          if (user?.address && r.address) {
            return r.address.toLowerCase() === user.address.toLowerCase();
          }
          if (user?.fid && r.fid) {
            return r.fid === user.fid;
          }
          return false;
        });

        if (idx >= 0) myPosition = idx + 1;
      }
    }

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    return (
      <div style={wrapper}>
        <div style={column}>
          <div style={card}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 12,
                gap: 10,
              }}
            >
              <img
                src={selectedTrivia.coverImageUrl}
                alt={selectedTrivia.title[language]}
                width={40}
                height={40}
                style={{
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.6)",
                  backgroundColor: "#020617",
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    opacity: 0.8,
                  }}
                >
                  🏆 {isSpanish ? "Ranking" : "Leaderboard"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {selectedTrivia.title[language]}
                </div>
              </div>
            </div>

            {rankingLoading && (
              <p style={{ fontSize: 13, opacity: 0.8 }}>
                {isSpanish ? "Cargando ranking…" : "Loading ranking…"}
              </p>
            )}

            {rankingError && (
              <p
                style={{
                  fontSize: 13,
                  color: "#fca5a5",
                  marginBottom: 8,
                }}
              >
                {rankingError}
              </p>
            )}

            {!rankingLoading && !rankingError && sorted.length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.8 }}>
                {isSpanish
                  ? "Aún no hay puntuaciones registradas para este quiz."
                  : "There are no scores yet for this quiz."}
              </p>
            )}

            {sorted.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 6,
                    marginBottom: 12,
                  }}
                >
                  {top3.map((entry, idx) => {
                    const pos = idx + 1;
                    const displayName =
                      entry.displayName ||
                      entry.username ||
                      (entry.address
                        ? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`
                        : entry.fid
                        ? `FID ${entry.fid}`
                        : "Player");

                    const isMe =
                      !!user &&
                      ((user.address &&
                        entry.address &&
                        user.address.toLowerCase() === entry.address.toLowerCase()) ||
                        (user.fid && entry.fid && user.fid === entry.fid));

                    const size = pos === 1 ? 70 : 56;

                    return (
                      <div
                        key={entry.id}
                        style={{
                          flex: 1,
                          textAlign: "center",
                          padding: 6,
                          borderRadius: 16,
                          background:
                            pos === 1
                              ? "linear-gradient(135deg,#fbbf24,#f97316)"
                              : "linear-gradient(135deg,#4b5563,#111827)",
                          color: pos === 1 ? "#111827" : "#e5e7eb",
                          boxShadow: isMe
                            ? "0 0 18px rgba(96,165,250,0.9)"
                            : "0 0 10px rgba(0,0,0,0.7)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          #{pos}
                        </div>

                        <div
                          style={{
                            width: size,
                            height: size,
                            borderRadius: "50%",
                            margin: "0 auto 4px",
                            overflow: "hidden",
                            border: "2px solid rgba(15,23,42,0.9)",
                            backgroundColor: "#020617",
                          }}
                        >
                          {entry.pfpUrl ? (
                            <img
                              src={entry.pfpUrl}
                              alt={displayName}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 18,
                              }}
                            >
                              🎬
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            marginBottom: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {displayName}
                        </div>

                        <div style={{ fontSize: 11 }}>{entry.score} pts</div>

                        {isMe && (
                          <div
                            style={{
                              fontSize: 10,
                              marginTop: 2,
                            }}
                          >
                            {isSpanish ? "Tú" : "You"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {rest.length > 0 && (
                  <div
                    style={{
                      maxHeight: 200,
                      overflowY: "auto",
                      borderRadius: 12,
                      border: "1px solid rgba(55,65,81,0.7)",
                      padding: 6,
                      background: "linear-gradient(180deg,#020617,#020617dd)",
                    }}
                  >
                    {rest.map((entry, idx) => {
                      const absolutePos = idx + 4;
                      const displayName =
                        entry.displayName ||
                        entry.username ||
                        (entry.address
                          ? `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`
                          : entry.fid
                          ? `FID ${entry.fid}`
                          : "Player");

                      const isMe =
                        !!user &&
                        ((user.address &&
                          entry.address &&
                          user.address.toLowerCase() === entry.address.toLowerCase()) ||
                          (user.fid && entry.fid && user.fid === entry.fid));

                      return (
                        <div
                          key={entry.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "4px 6px",
                            borderRadius: 10,
                            marginBottom: 4,
                            backgroundColor: isMe
                              ? "rgba(37,99,235,0.45)"
                              : "transparent",
                          }}
                        >
                          <div
                            style={{
                              width: 26,
                              textAlign: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              opacity: 0.9,
                            }}
                          >
                            #{absolutePos}
                          </div>

                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              overflow: "hidden",
                              marginRight: 6,
                              backgroundColor: "#020617",
                              border: "1px solid rgba(148,163,184,0.8)",
                            }}
                          >
                            {entry.pfpUrl ? (
                              <img
                                src={entry.pfpUrl}
                                alt={displayName}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 14,
                                }}
                              >
                                🎞️
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              flex: 1,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {displayName}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              marginLeft: 6,
                            }}
                          >
                            {entry.score}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {myPosition && (
                  <div
                    style={{
                      fontSize: 12,
                      marginTop: 8,
                      opacity: 0.9,
                    }}
                  >
                    {isSpanish
                      ? `Tu posición: #${myPosition}`
                      : `Your position: #${myPosition}`}
                  </div>
                )}
              </>
            )}

            <button
              onClick={() => setPhase("finished")}
              style={{
                ...mainButtonBase,
                marginTop: 14,
                background: "transparent",
                border: "1px solid #4b5563",
                color: "#e5e7eb",
              }}
            >
              ⬅️ {isSpanish ? "Volver al resultado" : "Back to result"}
            </button>

            <button
              onClick={handleBackToLibrary}
              style={{
                ...mainButtonBase,
                marginTop: 6,
                background: "transparent",
                border: "1px solid #1d4ed8",
                color: "#93c5fd",
              }}
            >
              📚 {isSpanish ? "Volver a la biblioteca" : "Back to library"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Resultado final
  // ---------------------------------------------------------------------------
  const rank = getRankForScore();
  const total = selectedTrivia?.questions.length ?? 0;
  const name =
    user?.displayName ||
    user?.username ||
    (language === "es" ? "Cine enjoyer" : "Movie enjoyer");

  return (
    <div style={wrapper}>
      <div style={column}>
        <div style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {user?.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt={name}
                width={52}
                height={52}
                style={{
                  borderRadius: "50%",
                  border: "2px solid #fbbf24",
                  objectFit: "cover",
                }}
              />
            )}

            <div>
              <div
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                {language === "es"
                  ? "Primer reto completado"
                  : "First trial completed"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{name}</div>
            </div>

            {selectedTrivia && (
              <img
                src={selectedTrivia.coverImageUrl}
                alt={selectedTrivia.title[language]}
                width={40}
                height={40}
                style={{
                  marginLeft: "auto",
                  borderRadius: 8,
                  border: "1px solid #374151",
                  objectFit: "cover",
                  backgroundColor: "#020617",
                }}
              />
            )}
          </div>

          <div
            style={{
              background:
                "radial-gradient(circle at top, #f59e0b 0%, #b45309 45%, #111827 100%)",
              borderRadius: 18,
              padding: "12px 14px",
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 4 }}>
              {language === "es"
                ? `Has completado el primer reto de ${
                    selectedTrivia?.title.es ?? "Farlander Trivia"
                  }.`
                : `You've completed the first ${
                    selectedTrivia?.title.en ?? "Farlander Trivia"
                  } challenge.`}
            </div>

            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {rank
                ? rank.title[language]
                : language === "es"
                ? "Aspirante"
                : "Contender"}
            </div>

            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {score}/{total}{" "}
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                {language === "es" ? "correctas" : "correct"}
              </span>
            </div>
          </div>

          {rank?.imageUrl?.[language] && (
            <div
              style={{
                marginBottom: 16,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <img
                src={rank.imageUrl[language]}
                alt={rank.title[language]}
                style={{
                  maxWidth: "100%",
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.5)",
                }}
              />
            </div>
          )}

          <button
            onClick={handleOpenRanking}
            style={{
              ...mainButtonBase,
              background:
                "linear-gradient(135deg,#22c55e 0%,#0ea5e9 50%,#a855f7 100%)",
              color: "#0b1120",
            }}
          >
            🏆{" "}
            {language === "es"
              ? "Ver ranking del quiz"
              : "View quiz leaderboard"}
          </button>

          <button
            onClick={handleShareScore}
            style={{
              ...mainButtonBase,
              background:
                "linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #fde047 100%)",
              color: "#111827",
            }}
          >
            📤 {language === "es" ? "Compartir mi puntuación" : "Share my score"}
          </button>

          <button
            onClick={handlePlayAgain}
            style={{
              ...mainButtonBase,
              background: "transparent",
              border: "1px solid #4b5563",
              color: "#e5e7eb",
            }}
          >
            🔁 {language === "es" ? "Jugar otra vez" : "Play again"}
          </button>

          <button
            onClick={handleBackToLibrary}
            style={{
              ...mainButtonBase,
              background: "transparent",
              border: "1px solid #1d4ed8",
              color: "#93c5fd",
              marginTop: 6,
            }}
          >
            📚{" "}
            {language === "es"
              ? "Volver a la biblioteca de trivias"
              : "Back to trivia library"}
          </button>
        </div>
      </div>
    </div>
  );
}