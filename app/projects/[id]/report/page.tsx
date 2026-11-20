import Report from './Report';

export default function ReportPage({ params }: { params: { id: string } }) {
  return <Report projectId={params.id} />;
}
