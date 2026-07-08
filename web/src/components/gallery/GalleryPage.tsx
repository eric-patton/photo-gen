import PageHeader from '../layout/PageHeader';

export default function GalleryPage() {
  return (
    <div>
      <PageHeader title="Gallery" />
      <div className="p-6 text-sm text-neutral-500">
        No images yet. Head to <span className="text-neutral-300">Generate</span> to create your
        first one.
      </div>
    </div>
  );
}
