import { Workspace } from "@/components/workspace";

export default function Home() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.MICROSOFT_CLIENT_ID,
  );
  return <Workspace configured={configured} />;
}
