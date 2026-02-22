import { useAuth } from '../contexts/AuthContext';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
    const { tier } = useAuth();
    if (!isOpen) return null;

    const tiers = [
        {
            name: 'Free',
            price: '0',
            features: [
                '10 Daily Trials',
                'Ads Included',
                'History: Slides kept for 2 days',
                'Standard AI Analysis'
            ],
            current: tier === 'free',
            color: 'slate'
        },
        {
            name: 'Premium',
            price: '1',
            features: [
                '50 Daily Trials',
                'Zero Ads - Focus Mode',
                'History: Slides kept for 30 days',
                'Priority Contextual Analysis',
                'All 5 Premium Mini-games'
            ],
            current: tier === 'premium',
            color: 'indigo',
            popular: true
        },
        {
            name: 'Unlimited',
            price: 'Custom',
            features: [
                '∞ Unlimited Daily Trials',
                'Permanent History (Lifetime)',
                'Priority Processing (VIP)',
                'Direct WhatsApp Support'
            ],
            current: tier === 'unlimited',
            color: 'amber'
        }
    ];

    const visibleTiers = tiers.filter(t => t.name !== 'Unlimited');

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-5xl bg-[#020617] border border-white/10 rounded-[2.5rem] p-6 md:p-12 shadow-2xl animate-in zoom-in-95 duration-500 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-400 transition-colors">✕</button>

                <div className="text-center mb-12">
                    <h2 className="text-3xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter italic">Upgrade Your <span className="text-indigo-500">Experience</span></h2>
                    <p className="text-slate-400 font-medium">Choose the plan that fits your study needs.</p>
                </div>

                <div className={`grid grid-cols-1 gap-6 ${visibleTiers.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-3xl mx-auto'}`}>
                    {visibleTiers.map((t) => (
                        <div key={t.name} className={`relative p-8 rounded-[2rem] border transition-all duration-500 ${t.current ? 'border-none ring-2 ring-white/20' : 'border-white/5 hover:border-white/20'} ${t.popular ? 'bg-indigo-600/5' : 'bg-white/[0.02]'}`}>
                            {t.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-xl shadow-indigo-500/40">
                                    Most Popular
                                </div>
                            )}
                            <h3 className={`text-2xl font-black mb-1 uppercase italic ${t.color === 'indigo' ? 'text-indigo-400' : (t.color === 'amber' ? 'text-amber-400' : 'text-slate-400')}`}>
                                {t.name}
                            </h3>
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-4xl font-black text-white tracking-tighter">{t.price}</span>
                                <span className="text-slate-500 text-sm font-bold uppercase">{t.name === 'Unlimited' ? '' : 'JOD / month'}</span>
                            </div>

                            <ul className="space-y-4 mb-8">
                                {t.features.map(f => (
                                    <li key={f} className="flex items-center gap-3 text-sm font-medium text-slate-300">
                                        <svg className={`w-4 h-4 ${t.color === 'indigo' ? 'text-indigo-400' : (t.color === 'amber' ? 'text-amber-400' : 'text-slate-500')}`} fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            {t.current ? (
                                <div className="w-full py-4 text-center text-slate-500 font-bold uppercase tracking-widest text-xs border border-white/5 rounded-2xl">
                                    Current Plan
                                </div>
                            ) : (
                                <a
                                    href={`https://wa.me/962792118641?text=${encodeURIComponent(`مرحبا، بدي اشترك بباقة الـ ${t.name} في موقع SlideMate`)}`}
                                    target="_blank"
                                    className={`block w-full py-4 text-center rounded-2xl font-black transition-all active:scale-95 shadow-xl ${t.color === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20' :
                                        (t.color === 'amber' ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20' : 'bg-white/5 hover:bg-white/10 text-white')
                                        }`}
                                >
                                    Choose {t.name}
                                </a>
                            )}
                        </div>
                    ))}
                </div>

                <p className="mt-12 text-center text-slate-600 text-xs font-medium uppercase tracking-[0.2em]">Secure payments and instant activation via WhatsApp</p>
            </div>
        </div>
    );
}
