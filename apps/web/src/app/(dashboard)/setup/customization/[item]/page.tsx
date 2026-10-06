import SetupSectionPage from "../../section-page";

const items = {
  rrqueues: { label: "RRQueues", description: "Manage persistent lead assignment queues.", href: "/setup/customization/rrqueues" },
  objects: { label: "Object Manager", description: "Create and configure CRM objects and fields.", href: "/admin/object-manager" },
};

export default async function CustomizationSetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  return <SetupSectionPage title={item?.label || "Customization"} description={item?.description || "Shape CRM data and user experiences."} items={item ? [item] : Object.values(items)} />;
}