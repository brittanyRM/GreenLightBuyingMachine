"use client";

import ContactDetail from "../../../components/ContactDetail";

export default function ContactPage({ params }) {
  return <ContactDetail contactId={params.id} />;
}
