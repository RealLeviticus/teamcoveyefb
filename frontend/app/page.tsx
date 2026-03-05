import { MainArea } from "@/components/main-area";
import { TwitchSidebar } from "@/components/twitch-sidebar";

export default function Page() {
  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 p-3 md:p-4">
      <div className="col-span-1 md:col-span-3 h-full flex flex-col gap-3 md:gap-4 min-h-0">
        <MainArea />
      </div>
      <TwitchSidebar />
    </div>
  );
}
