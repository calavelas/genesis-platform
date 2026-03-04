export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";

interface LegacyServiceDetailPageProps {
  params: Promise<{
    name: string;
  }>;
}

export default async function LegacyServiceDetailPage({ params }: LegacyServiceDetailPageProps) {
  const { name } = await params;
  redirect(`/application-services/${encodeURIComponent(name)}`);
}
