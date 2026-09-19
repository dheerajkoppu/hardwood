import { useEffect, useState } from "react";
import { Footer, TopBar } from "./components/TopBar";
import { loadDataset, type Dataset } from "./data";
import { Methodology } from "./pages/Methodology";
import { ModelLab } from "./pages/ModelLab";
import { PlayerPage } from "./pages/Player";
import { Players } from "./pages/Players";
import { Slate } from "./pages/Slate";
import { linkTo, useRoute, type Route } from "./router";

function Page({ dataset, route }: { dataset: Dataset; route: Route }) {
  const playerMatch = route.path.match(/^\/players\/(\d+)$/);
  if (route.path === "/") return <Slate dataset={dataset} route={route} />;
  if (route.path === "/players")
    return <Players dataset={dataset} route={route} />;
  if (playerMatch)
    return (
      <PlayerPage
        dataset={dataset}
        route={route}
        playerId={Number(playerMatch[1])}
      />
    );
  if (route.path === "/lab")
    return <ModelLab dataset={dataset} route={route} />;
  if (route.path === "/methodology") return <Methodology dataset={dataset} />;
  return (
    <div className="status">
      <h2>Page not found</h2>
      <p>
        <a href={linkTo("/")}>Back to the slate</a>
      </p>
    </div>
  );
}

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    loadDataset()
      .then(setDataset)
      .catch((reason: unknown) =>
        setFailure(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.path]);

  return (
    <>
      <TopBar path={route.path} metrics={dataset?.metrics ?? null} />
      <main>
        {failure ? (
          <div className="status">
            <h2>Model output is missing</h2>
            <p>
              The app reads projections written by the training pipeline. Run{" "}
              <code>make train</code> from the project root, then reload.
            </p>
            <p className="note">{failure}</p>
          </div>
        ) : dataset ? (
          <Page dataset={dataset} route={route} />
        ) : (
          <div className="status" aria-busy="true">
            <p>Loading model projections</p>
          </div>
        )}
      </main>
      {dataset && <Footer metrics={dataset.metrics} />}
    </>
  );
}
