import type { Metadata } from "next";
import MiniAppClient from "./MiniAppClient";

const miniAppEmbed = {
  version: "1",
  imageUrl: "https://criptomonedas.live/wp-content/uploads/2025/11/cinetrivia.png",
  button: {
    title: "Base Trace Score",
    action: {
      type: "launch_frame",
      name: "Base Trace Score",
      url: "https://trazabilidad-base-score.vercel.app/tracescore",
      splashImageUrl:
        "https://criptomonedas.live/wp-content/uploads/2025/11/cinetrivia.png",
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "fc:frame": JSON.stringify(miniAppEmbed),
  },
  title: "Base Trace Score",
  description:
    "Analiza tu actividad en Base, descubre tu ranking y nivel frente a otros usuarios.",
};
//rebuild force
export default function Page() {
  return <MiniAppClient />;
}