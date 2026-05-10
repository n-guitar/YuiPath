import { Layout, type ViewKey } from "@/components/Layout";
import { ProjectsView } from "@/views/ProjectsView";
import { SettingsView } from "@/views/SettingsView";
import { TasksView } from "@/views/TasksView";
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import "@/theme/styles.css";

export function App() {
  const [view, setView] = useState<ViewKey>("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  return (
    <Layout view={view} onViewChange={setView}>
      {view === "projects" && (
        <ProjectsView
          onSelect={(id) => {
            setSelectedProjectId(id);
            setView("tasks");
          }}
        />
      )}
      {view === "tasks" && <TasksView projectId={selectedProjectId} />}
      {view === "settings" && <SettingsView />}
    </Layout>
  );
}
