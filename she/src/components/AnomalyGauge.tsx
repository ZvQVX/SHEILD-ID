interface AnomalyGaugeProps {
  score: number;
}

const AnomalyGauge = ({ score }: AnomalyGaugeProps) => {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score <= 30) return "hsl(135, 100%, 50%)";
    if (score <= 70) return "hsl(45, 100%, 50%)";
    return "hsl(0, 100%, 60%)";
  };

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90">
        <circle
          cx="48" cy="48" r={radius}
          stroke="currentColor" strokeWidth="4" fill="transparent"
          className="text-muted/30"
        />
        <circle
          cx="48" cy="48" r={radius}
          stroke={getColor()} strokeWidth="4" fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2,0,0,1), stroke 0.5s" }}
        />
      </svg>
      <span className="absolute font-mono-data text-xl font-bold">{Math.round(score)}%</span>
    </div>
  );
};

export default AnomalyGauge;
