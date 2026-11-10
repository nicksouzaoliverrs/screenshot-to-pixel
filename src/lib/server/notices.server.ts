import { getDoc, setDoc } from "./google.server";
import { notify } from "./context.server";
import type { Notice } from "../types";

export async function deliverNotice(id: string) {
  const n = await getDoc<Notice>(`notices/${id}`);
  if (!n) return;
  const prefix = n.priority === "urgente" ? "Urgente: " : n.priority === "importante" ? "Importante: " : "";
  await notify(
    n.recipientUserIds.map((u) => ({
      userId: u,
      kind: "comunicado" as const,
      title: `${prefix}${n.title}`,
      body: n.body.slice(0, 180),
      link: "/comunicados",
      key: `comunicado_${id}_${u}`,
    })),
  );
  await setDoc(`notices/${id}`, { delivered: true });
}

