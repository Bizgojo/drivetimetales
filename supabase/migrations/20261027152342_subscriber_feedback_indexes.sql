create index story_contributor_credits_idea on public.story_contributor_credits(idea_id);
create index story_idea_workflows_selector on public.story_idea_workflows(selected_by);
create index subscriber_notifications_story on public.subscriber_notifications(story_id);
create index subscriber_notifications_pending on public.subscriber_notifications(created_at) where email_status in ('pending','failed');
