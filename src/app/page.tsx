import { application } from "@/lib/application";

export default function HomePage() {
  return (
    <main>
      <h1>{application.name}</h1>
      <p>Base inicial do projeto.</p>
    </main>
  );
}
