// Caller-owned Next.js App Router snippet. SameDayDesk D01 has no Next app.
// Not a product source file. Used only to check unparseable-source honesty:
// the shipped CLI must refuse, not invent SDS routes from page.tsx.

export default function ToolPage({ params }: { params: { slug: string } }) {
  return <main>tool {params.slug}</main>;
}
