import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { WorkspaceProvider, useWs } from "./state";
import { Sidebar, TopBar, FilterBar } from "./components/Shell";
import { Toast } from "./components/ui";
import Overview from "./views/Overview";
import Problems from "./views/Problems";
import Evidence from "./views/Evidence";
import Insights from "./views/Insights";
import History from "./views/History";
import Instructions from "./views/Instructions";

function Main() {
  const { view, dsError, ds, toast, setToast, setView } = useWs();
  const V = { overview: Overview, problems: Problems, evidence: Evidence, insights: Insights, history: History, instructions: Instructions }[view];
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <TopBar />
        {view !== "instructions" && view !== "history" && <FilterBar />}
        <main className="mx-auto max-w-[1360px] px-4 pb-16 pt-3 lg:px-8">
          {dsError && !ds && view !== "instructions" ? (
            <div className="card flex flex-col items-start gap-3 p-6">
              <h2 className="text-[17px] font-semibold">This file needs a comment column</h2>
              <p className="text-[13px] text-ink2">{dsError}</p>
              <button className="btn btn-primary" onClick={() => setView("instructions")}>Map columns</button>
            </div>
          ) : ds || view === "instructions" ? <V /> : <div className="p-10 text-ink3">Loading the FlowPilot dataset…</div>}
        </main>
      </div>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceProvider><Main /></WorkspaceProvider>
  </React.StrictMode>,
);
