import Workspace from './Workspace';

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <Workspace projectId={params.id} />;
}
