import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { FeatureTour } from "@/components/feature-tour";
import { Features } from "@/components/features";
import { Comparison } from "@/components/comparison";
import { HowItWorks } from "@/components/how-it-works";
import { Setup } from "@/components/setup";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <FeatureTour />
        <Features />
        <Comparison />
        <HowItWorks />
        <Setup />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
