"use client";

import { useRouter } from "next/navigation";
import DealForm from "../../../components/DealForm";

export default function NewDealPage() {
  const router = useRouter();
  return <DealForm onSaved={(deal) => router.push(`/deals/${deal.slug}`)} />;
}
