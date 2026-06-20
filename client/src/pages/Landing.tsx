import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Proof from "../components/Proof";
import Services from "../components/Services";
import HowItWorks from "../components/HowItWorks";
import Guarantee from "../components/Guarantee";
import Footer from "../components/Footer";

export default function Landing() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Proof />
        <Services />
        <HowItWorks />
        <Guarantee />
      </main>
      <Footer />
    </>
  );
}
