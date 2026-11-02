import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MediaType, Segment } from "../api/client";
import { BANDS, FRAME_FLAG_THRESHOLD } from "../config/models";

const TICK = { fontFamily: "Space Mono, monospace", fontSize: 10, fill: "#6b6a66" };

interface Props {
  segments: Segment[];
  mediaType: MediaType;
}

/**
 * Audio: one point per 4 s window (step line, x = window start).
 * Video: one point per sampled frame that contained a face (x = frame time).
 * The shaded band is the backend's "uncertain" zone.
 */
export function SegmentChart({ segments, mediaType }: Props) {
  const data = segments.map((s) => ({
    t: Number(s.start.toFixed(2)),
    end: Number(s.end.toFixed(2)),
    p: Math.round(s.fake_probability * 1000) / 10,
  }));

  return (
    <div
      className="chart-wrap"
      role="img"
      aria-label={`Manipulation probability over time across ${segments.length} ${
        mediaType === "audio" ? "audio windows" : "video frames"
      }`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="#e5e4de" vertical={false} />
          <ReferenceArea y1={BANDS.low * 100} y2={BANDS.high * 100} fill="#9a7b3c" fillOpacity={0.08} />
          {mediaType === "video" && (
            <ReferenceLine y={FRAME_FLAG_THRESHOLD * 100} stroke="#1c1c1c" strokeOpacity={0.35} strokeDasharray="4 4" />
          )}
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: "#e5e4de" }}
            unit="s"
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={TICK} tickLine={false} axisLine={false} unit="%" />
          <Tooltip
            cursor={{ stroke: "#1c1c1c", strokeOpacity: 0.2 }}
            contentStyle={{
              background: "#f7f6f2",
              border: "1px solid #e5e4de",
              borderRadius: 2,
              fontFamily: "Space Mono, monospace",
              fontSize: 11,
            }}
            labelFormatter={(t: number) => (mediaType === "audio" ? `Window from ${t}s` : `Frame at ${t}s`)}
            formatter={(v: number) => [`${v}%`, "Fake probability"]}
          />
          <Line
            type={mediaType === "audio" ? "stepAfter" : "linear"}
            dataKey="p"
            stroke="#3d7068"
            strokeWidth={1.5}
            dot={mediaType === "video" ? { r: 2, fill: "#3d7068", strokeWidth: 0 } : false}
            activeDot={{ r: 4, fill: "#3d7068", stroke: "#f7f6f2", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
