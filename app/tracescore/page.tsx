// app/cinetrivia/page.tsx
import type { Metadata } from "next";
import MiniAppClient from "./MiniAppClient";

const miniAppEmbed = {
  version: "1",
  imageUrl: "https://criptomonedas.live/wp-content/uploads/2025/11/cinetrivia.png",
  button: {
    title: "Farlander CineTrivia",
    action: {
      type: "launch_frame",
      name: "Farlander CineTrivia",
      // 👇 IMPORTANTE: la propia mini app, NO el endpoint de frames
      url: "https://how-famous-are-you.vercel.app/cinetrivia",
      splashImageUrl: "https://criptomonedas.live/wp-content/uploads/2025/11/cinetrivia.png",
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  other: {
    // Mini App Embed oficial
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    // Compatibilidad con clientes que aún miran fc:frame
    "fc:frame": JSON.stringify(miniAppEmbed),
  },
  title: "Farlander CineTrivia",
  description: "Daily movie trivia with Farlander. Guess, play and share!",
};

export default function Page() {
  // 🔥 Aquí ahora SÍ renderizamos la Mini App
  return <MiniAppClient />;
}
