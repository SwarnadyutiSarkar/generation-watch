import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface ResearchChartProps {
  title: string;
  unitExplanation: string;
  datasetAttribution: string;
  option: echarts.EChartsCoreOption | null;
  height?: number;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  footnote?: string;
}

export const ResearchChart: React.FC<ResearchChartProps> = ({
  title,
  unitExplanation,
  datasetAttribution,
  option,
  height = 300,
  emptyMessage = 'Data unavailable — import a historical dataset in Data Sources to populate this figure.',
  emptyActionLabel,
  onEmptyAction,
  footnote,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current || !option) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }

    const instance =
      chartInstanceRef.current || echarts.init(containerRef.current, undefined, { renderer: 'svg' });
    chartInstanceRef.current = instance;

    const mergedOption: echarts.EChartsCoreOption = {
      textStyle: {
        fontFamily: '"Public Sans", -apple-system, sans-serif',
        color: '#1C1F26',
      },
      ...option,
    };

    instance.setOption(mergedOption, true);

    const observer = new ResizeObserver(() => {
      instance.resize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [option]);

  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <figure className="bg-white border border-[#E4E2DC] p-6 flex flex-col justify-between">
      <div>
        <div className="text-xs text-[#525866] mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-[#0F1E36]">{datasetAttribution}</span>
          <span aria-hidden="true">·</span>
          <span>{unitExplanation}</span>
        </div>
        <h3 className="text-lg font-semibold text-[#0F1E36] leading-snug mb-4">{title}</h3>
      </div>

      {option ? (
        <div
          ref={containerRef}
          style={{ height: `${height}px`, width: '100%' }}
          role="img"
          aria-label={`${title}. ${unitExplanation}. Source: ${datasetAttribution}`}
        />
      ) : (
        <div
          style={{ minHeight: `${Math.min(height, 220)}px` }}
          className="bg-[#F8F7F4] border border-[#E4E2DC] p-6 flex flex-col items-center justify-center text-center"
        >
          <p className="text-sm text-[#525866] max-w-md leading-relaxed">{emptyMessage}</p>
          {emptyActionLabel && onEmptyAction && (
            <button
              type="button"
              onClick={onEmptyAction}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] transition-colors rounded whitespace-nowrap shrink-0 cursor-pointer"
            >
              {emptyActionLabel}
            </button>
          )}
        </div>
      )}

      {footnote && (
        <figcaption className="mt-4 pt-3 border-t border-[#E4E2DC] text-xs text-[#525866] leading-relaxed">
          {footnote}
        </figcaption>
      )}
    </figure>
  );
};
