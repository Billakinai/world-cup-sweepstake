import { useEffect, useState } from "react";
import CreatePage from "./pages/CreatePage";
import JoinPage from "./pages/JoinPage";
import RoomPage from "./pages/RoomPage";
import DrawPage from "./pages/DrawPage";
import ResultsPage from "./pages/ResultsPage";

/* Hash routes:
 *   #/             create
 *   #/join/:id     join
 *   #/room/:id     waiting room
 *   #/draw/:id     draw screen
 *   #/results/:id  results
 */

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [page, id] = raw.split("/");
  return { page: page || "home", id: id || null };
}

export function navigate(path) {
  window.location.hash = path.startsWith("/") ? `#${path}` : `#/${path}`;
}

export default function App() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  let view;
  switch (route.page) {
    case "join":
      view = <JoinPage id={route.id} key={`join-${route.id}`} />;
      break;
    case "room":
      view = <RoomPage id={route.id} key={`room-${route.id}`} />;
      break;
    case "draw":
      view = <DrawPage id={route.id} key={`draw-${route.id}`} />;
      break;
    case "results":
      view = <ResultsPage id={route.id} key={`results-${route.id}`} />;
      break;
    default:
      view = <CreatePage key="home" />;
  }

  return (
    <div className="pitch">
      <div className="pitch-lines" aria-hidden="true" />
      <main className="page" key={route.page + (route.id || "")}>
        {view}
      </main>
      <footer className="footer">⚽ Made for the family group chat · no app needed</footer>
    </div>
  );
}
