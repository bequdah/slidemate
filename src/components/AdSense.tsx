import { useEffect, type CSSProperties } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AdSenseProps {
    slot: string;
    format?: 'auto' | 'fluid' | 'rectangle';
    className?: string;
    style?: CSSProperties;
}

declare global {
    interface Window {
        adsbygoogle: any[];
    }
}

const PUBLISHER_ID = "ca-pub-4982700219212544";
const WHATSAPP_NUMBER = "962792118641";
const WHATSAPP_MSG = encodeURIComponent("مرحبا، بدي اشيل الاعلانات من موقع SlideMate (دينار/شهر)");

// ⚠️ غيّر هاد لـ true لما تجي موافقة الإعلانات
const SHOW_WHATSAPP_CTA = true;

export function AdSense({ slot, format = 'auto', className = '', style = {} }: AdSenseProps) {
    const { adsEnabled } = useAuth();

    const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`;

    useEffect(() => {
        if (!adsEnabled) return;
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {
            console.error('AdSense error:', e);
        }
    }, [adsEnabled]);

    // If user is premium (ads disabled), show nothing
    if (!adsEnabled) return null;

    return (
        <div className={`adsense-container ${className} flex flex-col items-center gap-3`} style={{ minHeight: '100px', ...style }}>
            {/* The actual AdSense ad */}
            <ins
                className="adsbygoogle w-full"
                style={{ display: 'block', ...style }}
                data-ad-client={PUBLISHER_ID}
                data-ad-slot={slot}
                data-ad-format={format}
                data-full-width-responsive="true"
            />

            {/* WhatsApp CTA - يظهر بس لما SHOW_WHATSAPP_CTA = true */}
            {SHOW_WHATSAPP_CTA && (
                <div className="w-full flex justify-center pb-2">
                    <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] font-bold text-indigo-400 hover:text-white transition-all uppercase tracking-widest bg-white/5 hover:bg-indigo-500/20 px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-lg backdrop-blur-sm"
                    >
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        إزالة الإعلانات (دينار/شهر)
                    </a>
                </div>
            )}
        </div>
    );
}
