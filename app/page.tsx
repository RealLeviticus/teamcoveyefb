import { MainArea } from "@/components/main-area";
import { TwitchSidebar } from "@/components/twitch-sidebar";

export default function Page() {
  return (
    <div className="h-full grid grid-cols-4 gap-4 p-4">
      <div className="col-span-4 md:col-span-3 h-full flex flex-col gap-4 min-h-0">
        <MainArea />
      </div>
      <TwitchSidebar />
    </div>
  );
}
