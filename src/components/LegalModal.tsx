

interface LegalModalProps {
    type: 'privacy' | 'terms' | 'contact' | null;
    onClose: () => void;
}

export function LegalModal({ type, onClose }: LegalModalProps) {
    if (!type) return null;

    const content = {
        privacy: {
            title: "سياسة الخصوصية (Privacy Policy)",
            body: [
                "نحن نحترم خصوصيتك. البيانات التي ترفعها (PDF/Images) تُستخدم فقط لغرض الشرح والدراسة ولا تُشارك مع أي طرف ثالث.",
                "نستخدم Google AdSense لعرض الإعلانات. قد يقوم جوجل بجمع بيانات غير شخصية لتحسين تجربة الإعلانات.",
                "يمكن للمشتركين في العضوية المميزة (Premium) إزالة الإعلانات تماماً من الموقع."
            ]
        },
        terms: {
            title: "شروط الاستخدام (Terms of Service)",
            body: [
                "SlideMate هو رفيق دراسي يعتمد على الذكاء الاصطناعي. النتائج مقدمة للمساعدة في الدراسة ولا نضمن دقتها بنسبة 100%.",
                "يُمنع استخدام الموقع في أغراض غير قانونية أو انتهاك حقوق الملكية الفكرية للملفات المرفوعة.",
                "الاشتراكات المميزة تمنحك تجربة خالية من الإعلانات ودعم مستمر للمشروع."
            ]
        },
        contact: {
            title: "اتصل بنا (Contact Us)",
            body: [
                "لأي استفسارات، شكاوى، أو لطلب تفعيل العضوية المميزة، يمكنك التواصل معنا مباشرة عبر الواتساب:",
                "رقم الهاتف: 962792118641+",
                "البريد الإلكتروني: support@slidemate.ai (قريباً)"
            ]
        }
    }[type];

    return (
        <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/5 text-slate-400">✕</button>
                <h2 className="text-xl font-black text-white mb-6 uppercase tracking-tight">{content.title}</h2>
                <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                    {content.body.map((line, i) => (
                        <p key={i}>{line}</p>
                    ))}
                </div>
                <button onClick={onClose} className="mt-8 w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-white transition-all">فهمت ذلك</button>
            </div>
        </div>
    );
}
