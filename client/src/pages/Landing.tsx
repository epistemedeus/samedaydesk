import Nav from "../components/Nav";
import Hero from "../components/Hero";
import ProofStrip from "../components/ProofStrip";
import DomainCheck from "../components/DomainCheck";
import BuildsTable from "../components/BuildsTable";
import AgentReadyScene from "../components/AgentReadyScene";
import FurtherOffers from "../components/FurtherOffers";
import HowItWorks from "../components/HowItWorks";
import Guarantee from "../components/Guarantee";
import Footer from "../components/Footer";
import { useScrollReveal } from "../motion/useScrollReveal";

export default function Landing() {
  useScrollReveal();
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <ProofStrip />
        <DomainCheck />
        <BuildsTable />
        <AgentReadyScene />
        <HowItWorks />
        <FurtherOffers />
        <Guarantee />
      </main>
      <Footer />
    </>
  );
}
