
import PaloAltoForm from '@/components/palo-alto-form';
import { ThemeToggleButton } from "@/components/theme-toggle-button";

export default function Home() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8 font-body">
      <div className="w-full max-w-2xl">
        <header className="text-center mb-8 relative">
          <h1 className="font-headline text-4xl sm:text-5xl font-bold text-primary">
            PANW OBJECT TOOL
          </h1>
          <div className="absolute top-0 right-0">
            <ThemeToggleButton />
          </div>
        </header>
        <PaloAltoForm />
      </div>
      <footer className="mt-12 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by Naming Scheme 28901
        </p>
      </footer>
    </main>
  );
}
