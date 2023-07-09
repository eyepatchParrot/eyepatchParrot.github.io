# Social network moderation inspired by IAM
What if social networks exposed moderation to users as a role which included a sequence of allowlists and blocklists as curated by human and automated moderators?

I enjoy listening to the Oxide and Friends podcast and they had a recent episode on moderation of federated social networks.
A take that I would be interested to hear feedback on would be to allow for a kind of opt-in moderation, and the best analogy I could come up with was accounts management.
For the first pages in a user's feed, your social network provides a basket of posts filtered from available posts on the site.

Some examples of filters:
1. Is this post near the user's network?
2. Is this post correlated with the user's interests?
3. Is this post contributing enough variety to the basket?
4. Is this post contributing enough variety to the user's longer term usage?
5. Does this post contributing to sufficiently recent events?
6. Does this post meet a minimum standard of appropriateness?
7. Does this post fail a minimum standard of appropriateness?

The "engagement" filters (1-5) are categorically different from "OK" filters (6-7).
This is far from comprehensive on either, but let's skip discussion of engagement and focus on OK.

Let's treat what the user wants in their feed (desirable posts) as an objective goal:
- Excluding desirable posts is a false negative
- Including undesirable posts is a false positive
- Including desirable posts is a true positive
- Excluding undesirable posts is a true negative

Separating allowlists from blocklists allows us to use true positives to override false negatives and true negatives to override false positives.
We already see systems like this at work on existing networks.
If a post is reported too much, it gets automatically hidden, but moderators can override that to keep it visible.
Regardless of how popular a post is, a moderator can hide the post.
Many networks have automated systems to permissively accept posts or to hide posts until they get moderator review.

This is missing customization of moderation and scalability.
Users are poorly served by moderation when they disagree on standards of appropriateness.
Human moderators are not scalable, and automation can be easily tricked in both directions.
To expose customization of desirability, a user can define relative prioritization of moderation ratings provided by moderators (automated or human).

A moderator is a mapping from posts to an allowlist or a blocklist.
Exposing users to moderators as a many-to-many mapping allows it

The degenerate cases is the most practical and common.
A topical moderation team is a moderator which is closed on users who are allowed to write to it and includes several users who collaborate on a single standard.
However, adding the potential for granularity helps to keep disagreements granular without forcing an all-or-nothing approach.
The most extreme disagreement would be moving to a different platform.

A particularly important kind of disagreement which requires granularity is mixing human moderation with automated moderation.
For example, Facebook has people employed to look at content which an ML model has flagged inappropriate to override and include it.
By exposing this automation as a first-class service, users can crowd-source automated moderators and sequence their priorities.

Now that we've added all of this customization and granularity and with it, complexity, how do we abstract it to practicality?
A role pre-defines a sequence of allowlists and blocklists from moderators.
Before customization, users in the cpp subreddit would get a default cpp subreddit role chosen by the platform.
So, the cpp subreddit current role would include:

1. Human moderator team allowlist (STL, blelbach, cleroth, foonathan, adzm)
2. Human moderator team blocklist (ditto)
3. Bot moderator blocklist (BotDefense)

I have a few ideas on how this plays into potential for advertisers if we assume that is a necessary.
If you disagree, then I hope this doesn't invalidate the rest of this.
Advertisers want to avoid advertising in contexts which are brand-inappropriate.
Using IAM moderation, advertisers could pick roles which are compatible with their brand.
For example, a company selling alcohol could ensure that its advertisements are blocked from users who participate in an AA role.
They could ensure this without having to avoid the platform altogether.

Why go to all this work to have the same end result?
This enables disagreements on priorities which are compatible with scalability.
So, we can imagine a user who wants to see Rust "shit-posts", but doesn't want to see arguments in Rust which are about adoption.
I think you could make a bot which would have a reasonable accuracy on identifying these two things separately, and the user can choose to see that order.
But, it's also a statement of preference rather than preventing people from arguing about adoption with people who want to engage with them.
It also allows people to get a default which is more curated without preventing them from self-curating from a less filtered source.
