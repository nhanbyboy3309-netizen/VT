import React, { useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

interface Props {
  data: string;
  size?: number;
}

export default function QRCodeDisplay({ data, size = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const qrCode = useRef<QRCodeStyling>(
    new QRCodeStyling({
      width: size,
      height: size,
      type: 'svg',
      data: data,
      dotsOptions: {
        color: '#1e293b',
        type: 'rounded'
      },
      backgroundOptions: {
        color: '#ffffff',
      },
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: 5
      }
    })
  );

  useEffect(() => {
    if (ref.current) {
      qrCode.current.append(ref.current);
    }
  }, []);

  useEffect(() => {
    qrCode.current.update({
      data: data
    });
  }, [data]);

  const downloadQR = () => {
    qrCode.current.download({
      name: 'document-qr',
      extension: 'png'
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={ref} className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100" />
      <button 
        onClick={downloadQR}
        className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 transition-colors"
      >
        Tải xuống mã QR
      </button>
    </div>
  );
}
