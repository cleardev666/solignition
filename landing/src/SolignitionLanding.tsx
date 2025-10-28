
import { Rocket, Shield, TrendingUp, Coins, FileText, Lock, Mail, ChevronRight, Zap, Users, BarChart3, Check, ArrowRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';


const SolignitionLanding = () => {
  const [scrolled, setScrolled] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-slate-950/95 backdrop-blur-lg border-b border-slate-800' : 'bg-transparent'
      }`}>
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
                
              </div>
              <span className="text-2xl font-bold tracking-tight">Solignition</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">How It Works</a>
              <a href="#economics" className="text-slate-300 hover:text-white transition-colors">Economics</a>
              <a href="#roadmap" className="text-slate-300 hover:text-white transition-colors">Roadmap</a>
              <a href="#contact" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-6 py-2.5 rounded-lg transition-all font-medium">
                Join waitlist
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background gradient effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-slate-950 to-slate-950"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-3xl"></div>
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
        
        {/* Robot SVG Background Elements */}
        <div className="absolute inset-0 opacity-5">
          {/* Robot 1 - Top Left */}
          <svg className="absolute top-20 left-10 w-32 h-32 text-purple-400" viewBox="0 0 100 100" fill="currentColor">
            <rect x="30" y="20" width="40" height="35" rx="5"/>
            <circle cx="42" cy="32" r="4"/>
            <circle cx="58" cy="32" r="4"/>
            <rect x="38" y="42" width="24" height="3" rx="1.5"/>
            <rect x="25" y="30" width="8" height="15" rx="2"/>
            <rect x="67" y="30" width="8" height="15" rx="2"/>
            <rect x="35" y="55" width="12" height="25" rx="2"/>
            <rect x="53" y="55" width="12" height="25" rx="2"/>
            <circle cx="50" cy="12" r="3"/>
            <line x1="50" y1="12" x2="50" y2="20" stroke="currentColor" strokeWidth="2"/>
          </svg>
          
          {/* Robot 2 - Top Right */}
          <svg className="absolute top-40 right-20 w-40 h-40 text-pink-400 transform rotate-12" viewBox="0 0 100 100" fill="currentColor">
            <rect x="25" y="25" width="50" height="40" rx="8"/>
            <circle cx="40" cy="40" r="5"/>
            <circle cx="60" cy="40" r="5"/>
            <path d="M 35 55 Q 50 60 65 55" stroke="currentColor" strokeWidth="3" fill="none"/>
            <rect x="15" y="35" width="10" height="20" rx="3"/>
            <rect x="75" y="35" width="10" height="20" rx="3"/>
            <rect x="35" y="65" width="10" height="20" rx="3"/>
            <rect x="55" y="65" width="10" height="20" rx="3"/>
            <rect x="45" y="15" width="10" height="10" rx="2"/>
          </svg>
          
          {/* Robot 3 - Bottom Left */}
          <svg className="absolute bottom-20 left-32 w-36 h-36 text-purple-400 transform -rotate-6" viewBox="0 0 100 100" fill="currentColor">
            <rect x="30" y="30" width="40" height="30" rx="6"/>
            <rect x="35" y="38" width="8" height="8" rx="2"/>
            <rect x="57" y="38" width="8" height="8" rx="2"/>
            <rect x="42" y="50" width="16" height="4" rx="2"/>
            <circle cx="50" cy="20" r="5"/>
            <line x1="50" y1="20" x2="50" y2="30" stroke="currentColor" strokeWidth="2"/>
            <rect x="20" y="40" width="10" height="15" rx="2"/>
            <rect x="70" y="40" width="10" height="15" rx="2"/>
            <rect x="38" y="60" width="8" height="18" rx="2"/>
            <rect x="54" y="60" width="8" height="18" rx="2"/>
          </svg>
          
          {/* Robot 4 - Bottom Right */}
          <svg className="absolute bottom-32 right-16 w-44 h-44 text-pink-400 transform rotate-6" viewBox="0 0 100 100" fill="currentColor">
            <rect x="28" y="28" width="44" height="38" rx="7"/>
            <circle cx="42" cy="42" r="5"/>
            <circle cx="58" cy="42" r="5"/>
            <ellipse cx="50" cy="55" rx="12" ry="6"/>
            <rect x="18" y="38" width="10" height="18" rx="3"/>
            <rect x="72" y="38" width="10" height="18" rx="3"/>
            <rect x="36" y="66" width="10" height="22" rx="3"/>
            <rect x="54" y="66" width="10" height="22" rx="3"/>
            <rect x="42" y="18" width="16" height="10" rx="3"/>
            <circle cx="44" cy="23" r="2"/>
            <circle cx="56" cy="23" r="2"/>
          </svg>
          
          {/* Robot 5 - Middle */}
          <svg className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-purple-300" viewBox="0 0 100 100" fill="currentColor">
            <rect x="25" y="25" width="50" height="45" rx="10"/>
            <circle cx="40" cy="42" r="6"/>
            <circle cx="60" cy="42" r="6"/>
            <path d="M 35 58 Q 50 65 65 58" stroke="currentColor" strokeWidth="3" fill="none"/>
            <rect x="12" y="38" width="13" height="22" rx="4"/>
            <rect x="75" y="38" width="13" height="22" rx="4"/>
            <rect x="35" y="70" width="12" height="25" rx="4"/>
            <rect x="53" y="70" width="12" height="25" rx="4"/>
            <circle cx="50" cy="15" r="4"/>
            <line x1="50" y1="15" x2="50" y2="25" stroke="currentColor" strokeWidth="2"/>
            <circle cx="43" cy="10" r="2"/>
            <circle cx="57" cy="10" r="2"/>
          </svg>
          
          {/* Additional small robots scattered */}
          <svg className="absolute top-1/3 right-1/3 w-24 h-24 text-purple-400 transform -rotate-12" viewBox="0 0 100 100" fill="currentColor">
            <rect x="35" y="30" width="30" height="25" rx="4"/>
            <circle cx="45" cy="40" r="3"/>
            <circle cx="55" cy="40" r="3"/>
            <rect x="42" y="48" width="16" height="2"/>
            <rect x="30" y="37" width="5" height="12" rx="1"/>
            <rect x="65" y="37" width="5" height="12" rx="1"/>
            <rect x="40" y="55" width="7" height="15" rx="2"/>
            <rect x="53" y="55" width="7" height="15" rx="2"/>
          </svg>
          
          <svg className="absolute bottom-1/4 left-1/4 w-28 h-28 text-pink-300 transform rotate-45" viewBox="0 0 100 100" fill="currentColor">
            <rect x="32" y="28" width="36" height="32" rx="6"/>
            <circle cx="44" cy="40" r="4"/>
            <circle cx="56" cy="40" r="4"/>
            <path d="M 40 52 L 60 52" stroke="currentColor" strokeWidth="2"/>
            <rect x="22" y="36" width="10" height="16" rx="2"/>
            <rect x="68" y="36" width="10" height="16" rx="2"/>
            <rect x="38" y="60" width="10" height="20" rx="2"/>
            <rect x="52" y="60" width="10" height="20" rx="2"/>
          </svg>
        </div>
        
        {/* Geometric patterns for tech feel */}
        <div className="absolute inset-0 opacity-3">
          <div className="absolute top-10 right-40 w-20 h-20 border-2 border-purple-500/20 rotate-45"></div>
          <div className="absolute bottom-40 left-20 w-16 h-16 border-2 border-pink-500/20 rotate-12"></div>
          <div className="absolute top-1/3 left-1/4 w-12 h-12 border-2 border-purple-500/20 -rotate-12"></div>
          <div className="absolute bottom-1/3 right-1/4 w-14 h-14 border-2 border-pink-500/20 rotate-45"></div>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center space-x-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700 px-4 py-2 rounded-full mb-8">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-slate-300">Built on Solana | DeFi Infrastructure</span>
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold mb-6 leading-tight">
              Fueling Developer
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Innovation on Solana
              </span>
            </h1>
            
            <p className="text-xl text-slate-400 mb-12 max-w-3xl mx-auto leading-relaxed">
              Deploy your Solana programs at a reduced cost. Access transparent, automated lending 
              through secure smart contracts and start your journey on mainnet.
            </p>
            
            <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
              <button inert={true} className="group bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2">
                <span>Coming soon</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button inert={true} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-8 py-4 rounded-lg text-lg font-semibold transition-all flex items-center justify-center space-x-2">
                <span>View Documentation</span>
                <ChevronRight className="w-5 h-5" />

              </button>
            </div>

            {/* CTA Section */}
      <section
      id="contact"
      className="py-24 bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptMCAyYy0yLjIxIDAtNCA1Ljc5LTQgOHMxLjc5IDQgNCA0IDQtMS43OSA0LTQtMS43OS00LTQtNHoiIGZpbGw9IiM4YjVjZjYiIG9wYWNpdHk9Ii4wNSIvPjwvZz48L3N2Zz4=')] opacity-40"></div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-purple-500/30 rounded-3xl p-12 md:p-16 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl"></div>

            <div className="relative z-10 text-center">
              <div className="inline-flex items-center space-x-2 bg-purple-500/10 border border-purple-500/30 px-4 py-2 rounded-full mb-6">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-purple-400 font-medium">Join Early Access</span>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Ready to Build on Solana?
              </h2>
              <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
                Join us in building the future of permissionless innovation on Solana. 
                Get early access and be among the first developers to deploy without barriers.
              </p>

              {/* Button triggers the Google Form modal */}
              <button
                onClick={() => setShowForm(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 px-8 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25"
              >
                Get Early Access
              </button>

              {/* Modal */}
              {showForm && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                  <div className="relative bg-slate-900 border border-purple-500/30 rounded-2xl w-[90%] md:w-[800px] h-[80vh] shadow-2xl overflow-hidden">
                    {/* Close button */}
                    <button
                      onClick={() => setShowForm(false)}
                      className="absolute top-3 right-3 text-slate-400 hover:text-white transition"
                    >
                      <X className="w-6 h-6" />
                    </button>

                    {/* Embedded Google Form */}
                    <iframe
                      src="https://docs.google.com/forms/d/e/1FAIpQLSfcg1ZDeEQMp9NyApXXXFUbrZtK6blupGrGeUa_hQHBVsX_Kg/viewform?embedded=true"
                      width="100%"
                      height="100%"
                      className="rounded-2xl"
                      frameBorder="0"
                      marginHeight={0}
                      marginWidth={0}
                    >
                      Loading…
                    </iframe>
                  </div>
                </div>
              )}

              {/* Contact info */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-slate-400 mt-10">
                <a href="mailto:solignition@protonmail.com" className="flex items-center gap-2 hover:text-purple-400 transition-colors">
                  <div className="bg-slate-800 p-2 rounded-lg">
                    <Mail className="w-5 h-5" />
                  </div>
                  <span className="text-sm">solignition@protonmail.com</span>
                </a>
                <span className="hidden sm:block text-slate-700">•</span>
                <a
                  href="https://x.com/Solignition"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-purple-400 transition-colors"
                >
                  <div className="bg-slate-800 p-2 rounded-lg">
                    <X className="w-5 h-5" />
                  </div>
                  <span className="text-sm">@Solignition</span>
                </a>
              </div>

              <div className="grid grid-cols-3 gap-6 mt-12 pt-10 border-t border-slate-800">
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-slate-400">No credit checks</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-slate-400">Instant deployment</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-slate-400">Transparent terms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

            {/* Stats 
            <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto">
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
                <div className="text-3xl font-bold text-purple-400 mb-2">10k+</div>
                <div className="text-sm text-slate-400">Projected Deployments</div>
              </div>
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
                <div className="text-3xl font-bold text-pink-400 mb-2">$250k+</div>
                <div className="text-sm text-slate-400">Annual Revenue</div>
              </div>
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl p-6">
                <div className="text-3xl font-bold text-purple-400 mb-2">0.5-2%</div>
                <div className="text-sm text-slate-400">Deployment Fee</div>
              </div>
            </div>*/}
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">The Challenge</h2>
              <p className="text-xl text-slate-400">Breaking down barriers to Solana development</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div className="group relative bg-slate-900 p-10 rounded-2xl border border-slate-800 hover:border-purple-500/50 transition-all duration-300">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl"></div>
                <div className="bg-purple-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6">
                  <Lock className="w-7 h-7 text-purple-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-4">Capital Barrier</h3>
                <p className="text-slate-400 leading-relaxed">
                  Deploying and maintaining programs requires SOL upfront. New developers often lack this liquidity, 
                  creating a financial roadblock that stifles innovation and prevents talented builders from bringing 
                  their ideas to life on Solana.
                </p>
              </div>
              
              <div className="group relative bg-slate-900 p-10 rounded-2xl border border-slate-800 hover:border-pink-500/50 transition-all duration-300">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-t-2xl"></div>
                <div className="bg-pink-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-7 h-7 text-pink-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-4">Growth Impact</h3>
                <p className="text-slate-400 leading-relaxed">
                  These barriers result in slower ecosystem expansion and fewer groundbreaking deployments 
                  reaching mainnet. The Solana ecosystem loses potential innovation and developers seek 
                  alternative platforms with lower entry costs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        
        {/* Animated Robot Workers */}
        <div className="absolute inset-0 opacity-5">
          {/* Working Robot 1 */}
          <svg className="absolute top-10 right-10 w-40 h-40 text-purple-400 animate-pulse" viewBox="0 0 100 100" fill="currentColor" style={{animationDuration: '3s'}}>
            <rect x="28" y="25" width="44" height="40" rx="8"/>
            <circle cx="42" cy="40" r="5"/>
            <circle cx="58" cy="40" r="5"/>
            <path d="M 38 55 Q 50 58 62 55" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="16" y="35" width="12" height="20" rx="3"/>
            <rect x="72" y="35" width="12" height="20" rx="3"/>
            <rect x="36" y="65" width="10" height="22" rx="3"/>
            <rect x="54" y="65" width="10" height="22" rx="3"/>
            <circle cx="50" cy="15" r="4"/>
            <line x1="50" y1="15" x2="50" y2="25" stroke="currentColor" strokeWidth="2"/>
            {/* Tool in hand */}
            <rect x="5" y="42" width="8" height="3" rx="1" transform="rotate(-20 9 43)"/>
          </svg>
          
          {/* Working Robot 2 */}
          <svg className="absolute bottom-20 left-16 w-36 h-36 text-pink-400 animate-pulse" viewBox="0 0 100 100" fill="currentColor" style={{animationDuration: '4s'}}>
            <rect x="30" y="28" width="40" height="36" rx="7"/>
            <circle cx="43" cy="42" r="4"/>
            <circle cx="57" cy="42" r="4"/>
            <ellipse cx="50" cy="54" rx="10" ry="5"/>
            <rect x="20" y="38" width="10" height="18" rx="3"/>
            <rect x="70" y="38" width="10" height="18" rx="3"/>
            <rect x="38" y="64" width="9" height="20" rx="3"/>
            <rect x="53" y="64" width="9" height="20" rx="3"/>
            <rect x="42" y="18" width="16" height="10" rx="3"/>
            {/* Gear icon */}
            <circle cx="85" cy="45" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="85" cy="45" r="3"/>
          </svg>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How Solignition Works</h2>
            <p className="text-xl text-slate-400">Transparent, automated lending in five simple steps</p>
          </div>
          
          <div className="max-w-5xl mx-auto">
            {[
              {
                icon: <Coins className="w-6 h-6" />,
                title: "Pooling",
                description: "Users deposit SOL into the protocol and begin earning yield from deployment fees and interest. Liquidity providers earn passive income while supporting developer innovation.",
                gradient: "from-purple-500 to-purple-600"
              },
              {
                icon: <FileText className="w-6 h-6" />,
                title: "Loan Request",
                description: "Developers submit their program bytecode and deployment intent through our streamlined interface. The process is simple, fast, and requires no traditional credit checks.",
                gradient: "from-pink-500 to-pink-600"
              },
              {
                icon: <Rocket className="w-6 h-6" />,
                title: "Deployment",
                description: "Solignition deploys the program on-chain using pooled SOL, with the protocol retaining temporary upgrade authority to ensure security and proper fund management.",
                gradient: "from-purple-500 to-pink-500"
              },
              {
                icon: <TrendingUp className="w-6 h-6" />,
                title: "Repayment",
                description: "Developer repays principal plus fee, receiving full upgrade authority and complete ownership of their deployed program. It's that simple.",
                gradient: "from-pink-500 to-purple-500"
              },
              {
                icon: <Shield className="w-6 h-6" />,
                title: "Fallback Protection",
                description: "Non-repayment triggers automatic program closure, reclaiming SOL to protect depositors and maintain pool health. Smart contracts ensure security for all parties.",
                gradient: "from-purple-600 to-purple-500"
              }
            ].map((step, index) => (
              <div key={index} className="relative mb-8 last:mb-0">
                {/* Connector line */}
                {index < 4 && (
                  <div className="absolute left-9 top-20 w-0.5 h-16 bg-gradient-to-b from-purple-500/50 to-transparent"></div>
                )}
                
                <div className="flex gap-6 items-start group">
                  <div className={`flex-shrink-0 w-18 h-18 rounded-2xl bg-gradient-to-br ${step.gradient} p-[2px]`}>
                    <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
                      <div className={`bg-gradient-to-br ${step.gradient} p-3 rounded-xl`}>
                        {step.icon}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-8 group-hover:border-purple-500/50 transition-all duration-300">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-semibold text-purple-400">STEP {index + 1}</span>
                    </div>
                    <h3 className="text-2xl font-semibold mb-3">{step.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Economics Section */}
      <section id="economics" className="py-24 bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-hidden">
        {/* Robot background elements */}
        <div className="absolute inset-0 opacity-10">
          <svg className="absolute top-20 left-20 w-32 h-32 text-purple-400" viewBox="0 0 100 100" fill="currentColor">
            <rect x="32" y="28" width="36" height="32" rx="6"/>
            <circle cx="44" cy="42" r="4"/>
            <circle cx="56" cy="42" r="4"/>
            <path d="M 40 52 Q 50 56 60 52" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="24" y="38" width="8" height="16" rx="2"/>
            <rect x="68" y="38" width="8" height="16" rx="2"/>
            <rect x="40" y="60" width="8" height="18" rx="2"/>
            <rect x="52" y="60" width="8" height="18" rx="2"/>
            {/* Money symbol */}
            <text x="80" y="30" fontSize="12" fill="currentColor">$</text>
          </svg>
          
          <svg className="absolute bottom-32 right-24 w-40 h-40 text-pink-400 transform rotate-12" viewBox="0 0 100 100" fill="currentColor">
            <rect x="26" y="26" width="48" height="42" rx="8"/>
            <circle cx="42" cy="44" r="5"/>
            <circle cx="58" cy="44" r="5"/>
            <path d="M 36 58 Q 50 64 64 58" stroke="currentColor" strokeWidth="3" fill="none"/>
            <rect x="14" y="36" width="12" height="22" rx="3"/>
            <rect x="74" y="36" width="12" height="22" rx="3"/>
            <rect x="36" y="68" width="11" height="24" rx="3"/>
            <rect x="53" y="68" width="11" height="24" rx="3"/>
            <circle cx="50" cy="16" r="4"/>
          </svg>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">Sustainable Yield Model</h2>
              <p className="text-xl text-slate-400">Revenue streams that grow with the ecosystem</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/40 transition-all">
                <div className="bg-purple-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <BarChart3 className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Deployment Fee</h3>
                <div className="text-3xl font-bold text-purple-400 mb-3">% based with minimum</div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Charged on deployed SOL loan amount at time of deployment
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border border-pink-500/20 rounded-2xl p-8 hover:border-pink-500/40 transition-all">
                <div className="bg-pink-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-6 h-6 text-pink-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Extension Fee</h3>
                <div className="text-3xl font-bold text-pink-400 mb-3">Variable</div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Flexible fee structure for extending loan periods
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/20 rounded-2xl p-8 hover:border-purple-500/40 transition-all">
                <div className="bg-purple-500/20 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                  <Coins className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Interest Margin</h3>
                <div className="text-3xl font-bold text-purple-400 mb-3">Shared</div>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Generated from repayments, distributed to depositors
                </p>
              </div>
            </div>

            {/* Example Economics Card 
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl"></div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-2 rounded-lg">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <h3 className="text-2xl font-semibold">Example Economics</h3>
                </div>
                
                <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <div>
                      <div className="text-sm text-slate-500 uppercase tracking-wide mb-2">Average Loan</div>
                      <div className="text-4xl font-bold text-purple-400">10 SOL</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 uppercase tracking-wide mb-2">Deployment Fee</div>
                      <div className="text-4xl font-bold text-pink-400">0.15 SOL</div>
                      <div className="text-sm text-slate-400 mt-1">1.5% of loan amount</div>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="text-sm text-slate-500 uppercase tracking-wide mb-2">Annual Volume</div>
                      <div className="text-4xl font-bold text-purple-400">10,000</div>
                      <div className="text-sm text-slate-400 mt-1">Projected deployments</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 uppercase tracking-wide mb-2">Protocol Revenue</div>
                      <div className="text-4xl font-bold text-pink-400">1,500 SOL</div>
                      <div className="text-sm text-slate-400 mt-1">≈ $250k+ annually</div>
                    </div>
                  </div>
                </div>

                <div className="mt-10 pt-8 border-t border-slate-800">
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div>
                      <div className="text-2xl font-bold text-purple-400 mb-1">Scalable</div>
                      <div className="text-sm text-slate-400">Revenue grows with adoption</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-pink-400 mb-1">Sustainable</div>
                      <div className="text-sm text-slate-400">Built for long-term growth</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-400 mb-1">Fair</div>
                      <div className="text-sm text-slate-400">Value shared with community</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>*/}
          </div>
        </div>
      </section>

      {/* Roadmap Section */}
      <section id="roadmap" className="py-24 bg-slate-950 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl"></div>
        
        {/* Future-looking robots */}
        <div className="absolute inset-0 opacity-5">
          <svg className="absolute top-32 right-32 w-36 h-36 text-purple-400 transform -rotate-12 animate-pulse" viewBox="0 0 100 100" fill="currentColor" style={{animationDuration: '5s'}}>
            <rect x="28" y="24" width="44" height="40" rx="8"/>
            <circle cx="42" cy="40" r="5"/>
            <circle cx="58" cy="40" r="5"/>
            <path d="M 38 56 Q 50 62 62 56" stroke="currentColor" strokeWidth="2" fill="none"/>
            <rect x="16" y="34" width="12" height="22" rx="3"/>
            <rect x="72" y="34" width="12" height="22" rx="3"/>
            <rect x="36" y="64" width="10" height="24" rx="3"/>
            <rect x="54" y="64" width="10" height="24" rx="3"/>
            <circle cx="50" cy="14" r="4"/>
            <line x1="50" y1="14" x2="50" y2="24" stroke="currentColor" strokeWidth="2"/>
            {/* Rocket icon */}
            <path d="M 85 35 L 90 25 L 95 35 L 90 32 Z" fill="currentColor"/>
          </svg>
          
          <svg className="absolute bottom-40 left-40 w-32 h-32 text-pink-400 transform rotate-6" viewBox="0 0 100 100" fill="currentColor">
            <rect x="32" y="30" width="36" height="32" rx="6"/>
            <circle cx="44" cy="44" r="4"/>
            <circle cx="56" cy="44" r="4"/>
            <rect x="42" y="52" width="16" height="3" rx="1.5"/>
            <rect x="24" y="40" width="8" height="16" rx="2"/>
            <rect x="68" y="40" width="8" height="16" rx="2"/>
            <rect x="40" y="62" width="8" height="18" rx="2"/>
            <rect x="52" y="62" width="8" height="18" rx="2"/>
            <rect x="44" y="20" width="12" height="10" rx="2"/>
          </svg>
        </div>
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Product Roadmap</h2>
            <p className="text-xl text-slate-400">Our journey to mainnet and beyond</p>
          </div>
          
          <div className="max-w-5xl mx-auto">
            {[
              {
                period: "Q4 2025",
                title: "Alpha Launch",
                items: [
                  { text: "Alpha launch on Devnet", icon: <Rocket className="w-4 h-4" /> },
                  { text: "Comprehensive security audits", icon: <Shield className="w-4 h-4" /> },
                  { text: "Strategic partnership announcements", icon: <Users className="w-4 h-4" /> }
                ],
                status: "current",
                gradient: "from-purple-500 to-purple-600"
              },
              {
                period: "Q1-Q2 2026",
                title: "Mainnet Launch",
                items: [
                  { text: "Mainnet launch", icon: <Zap className="w-4 h-4" /> },
                  { text: "Initial liquidity bootstrapping", icon: <Coins className="w-4 h-4" /> }
                ],
                status: "upcoming",
                gradient: "from-pink-500 to-pink-600"
              },
              {
                period: "Q2-Q3 2026",
                title: "Advanced Features",
                items: [
                  { text: "DAO governance implementation", icon: <Users className="w-4 h-4" /> },
                  { text: "Secondary market for loan trading", icon: <TrendingUp className="w-4 h-4" /> },
                  { text: "Advanced analytics dashboard", icon: <BarChart3 className="w-4 h-4" /> }
                ],
                status: "planned",
                gradient: "from-purple-600 to-pink-500"
              }
            ].map((phase, index) => (
              <div key={index} className="relative mb-12 last:mb-0">
                {/* Timeline connector */}
                {index < 2 && (
                  <div className="absolute left-12 top-24 w-0.5 h-24 bg-gradient-to-b from-purple-500/50 to-transparent hidden md:block"></div>
                )}
                
                <div className="flex gap-8 items-start">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 hidden md:flex flex-col items-center">
                    <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${phase.gradient} p-[2px]`}>
                      <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center">
                        <div className="text-3xl font-bold bg-gradient-to-br from-purple-400 to-pink-400 bg-clip-text text-transparent">
                          {index + 1}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-8 hover:border-purple-500/50 transition-all duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <div className="text-sm font-semibold text-purple-400 uppercase tracking-wide mb-2">
                          {phase.status === 'current' ? ' Current Phase' : phase.status === 'upcoming' ? 'Next' : 'Planned'}
                        </div>
                        <h3 className="text-3xl font-bold mb-1">{phase.period}</h3>
                        <p className="text-xl text-slate-400">{phase.title}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {phase.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-3 group">
                          <div className={`mt-1 bg-gradient-to-br ${phase.gradient} p-2 rounded-lg group-hover:scale-110 transition-transform`}>
                            {item.icon}
                          </div>
                          <span className="text-slate-300 leading-relaxed">{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-xl font-bold">Solignition</div>
                <div className="text-sm text-slate-500">Built on Solana</div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400">
              <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
              <a href="#economics" className="hover:text-white transition-colors">Economics</a>
              <a href="#roadmap" className="hover:text-white transition-colors">Roadmap</a>
              {/*<a href="https://docs.solignition.xyz" className="hover:text-white transition-colors">Documentation</a>*/}
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-slate-900 text-center">
            <p className="text-slate-500 text-sm">
              © 2025 Solignition. All rights reserved. | DeFi / Web3 Infrastructure
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SolignitionLanding;