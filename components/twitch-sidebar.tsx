"use client";

import { Panel } from "@/components/panel";
import { TwitchChat } from "@/components/twitch-chat";
import { ReloadButton } from "@/components/reload-button";
import React from "react";

/**
 * Isolated sidebar that never re-renders unless its own props change.
 * MainArea state changes won't affect this component at all.
 */
function TwitchSidebarInner() {
  return (
    <aside className="hidden md:block col-span-1 h-full min-h-0">
      <Panel title="Twitch Chat" actions={<ReloadButton />} className="h-full min-h-0">
        <div className="h-full rounded-lg overflow-hidden bg-neutral-50 dark:bg-neutral-900">
          <TwitchChat
            channel="teamcovey"
            className="w-full h-full"
            // extraParents={["efb.teamcovey.com", "www.efb.teamcovey.com"]}
          />
        </div>
      </Panel>
    </aside>
  );
}

// Memoize so parent renders don't re-render the sidebar
export const TwitchSidebar = React.memo(TwitchSidebarInner);
