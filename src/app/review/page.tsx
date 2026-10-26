import { getReviewByDate, listRecentReviews } from '@/server/actions/review';
import { todayKey } from '@/lib/utils';
import { ReviewEditor } from './review-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: '复盘' };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : todayKey();

  const [review, history] = await Promise.all([
    getReviewByDate(date),
    listRecentReviews(),
  ]);

  return (
    <ReviewEditor
      initialDate={date}
      initialReview={review ?? null}
      history={history}
    />
  );
}
