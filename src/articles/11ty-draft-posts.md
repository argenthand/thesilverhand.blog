---
title: "Using draft posts to control content on this blog"
summary: "How I implemented draft content and automated publishing in 11ty."
date: 2024-05-27
published: true
tags: ["11ty", "meta"]
---

On this blog, I have the ability to create drafts that allow me to work on multiple articles in parallel and also 
control the release schedule for my content.

## The Requirements
To start with, I laid out what I wanted from a draft system:
1. An article marked as draft should not be listed on the blog at all.
2. If I set the publication date of an article in the future, it should not be listed on the blog until said date.
3. In development mode, I want all articles to be listed, with status badges for "draft" and "ready to publish" 
   articles.
4. I want to avoid manual builds of my blog just to list "ready to go" articles. This is a requirement as this blog 
   is statically built.

## The Solution
Once I had the requirements finalized, I set out to create my system. For drafts, I used 11ty's custom collections 
to create a collection that filters out any article that doesn't have the published flag, but only when I'm 
building a site for deploying. When in development mode, I want to see all articles.
```js
// in .eleventy.config.js
eleventyConfig.addCollection("articles", function (collectionApi) {
  return collectionApi.getFilteredByTag("articles")
    .filter(function (article) {
      if (process.env.BUILD_DRAFTS === "true") return true;
      return "published" in article.data && article.data?.published;
    })
    .sort(function (a, b) {
      return b.date - a.date;
    });
});

// https://www.11ty.dev/docs/dev-server/
// server config
if (process.env.ELEVENTY_RUN_MODE === "serve") {
  process.env.BUILD_DRAFTS = "true";
}
```

For the publication date, I used the `date` frontmatter property. I implemented a check comparing the article's 
date against the current date using [luxon's](https://moment.github.io/luxon/#/) helper methods. 11ty uses UTC to parse any dates and times, so I 
parse my article's date as UTC to avoid [off-by-one](https://www.11ty.dev/docs/dates/#dates-off-by-one-day) errors.
```js
// the rest of the config file...

config.addCollection("articles", function (collectionApi) {
  return collectionApi.getFilteredByTag("articles")
     .filter(function (article) {
        if (process.env.BUILD_DRAFTS === "true") return true;
        const now = DateTime.utc();
        const articleDate = DateTime.fromJSDate(article.data.date, {zone: "UTC"});
        return "published" in article.data && article.data?.published && now >= articleDate;
     })
     .sort(function (a, b) {
        return b.date - a.date;
     });
});
```

In order to get the status badges for articles, I used Nunjucks's [`macro`](https://mozilla.github.io/nunjucks/templating.html#macro)
tag to create a function that displays a `<small>` tag that says either `DRAFT` 
or `READY` depending on each article's `date` and `published` frontmatter properties.

{% raw %}
```html
{% macro articles(list) %}
  <div class="grid grid-cols-1 sm:grid-cols-2 grid-flow-row items-stretch gap-4">
    {%- for post in list -%}
      <article class="mt-2 mb-4 [&_a_h3]:hover:underline flex flex-col justify-between gap-4">
        <a href="{{ post.url }}" class="no-underline">
          <h3 class="mb-4">{{ post.data.title }}</h3>
          <p class="font-light tracking-wider">{{ post.data.summary }}</p>
        </a>
        <div class="flex justify-between items-center">
          <small class="uppercase">{{ post.data.date | readableDate }}</small>
          {% if not post.data.published %}
            <small class="bg-amber-100 text-amber-600 py-2 px-3 rounded-full uppercase">&#9888; draft</small>
          {% endif %}
          {% if post.data.date | isDateInFuture and post.data.published %}
            <small class="bg-blue-200 text-blue-600 py-2 px-3 rounded-full uppercase">&#x2714; ready</small>
          {% endif %}
        </div>
      </article>
    {%- endfor -%}
  </div>
{% endmacro %}
```
{% endraw %}

And here's how that looks when I'm running the site in development mode (along with a sneak peek at an upcoming 
article):
![Screenshot of a grid of article titles](/assets/11ty-draft-posts-badges.png)

That's all I could do within 11ty. To get the automated deployments going, I needed to go to the deployment flow. My 
blog is deployed on Azure Static Web Apps using a GitHub Actions script that Azure generated for me. This script 
will build and deploy the site any time a commit is made to the `main` branch of the git repository, either through 
a direct commit or a PR getting merged into `main`. This setup is already partially automated, but I'd still only 
get new posts when I actually made a commit. The limit to this approach is that if I have an article "ready-to-go", 
i.e. I'm finished with it but want to publish it in the future, I still have to either do a manual deployment on 
the date I want the article to go live on the blog, or push a (probably) unrelated commit. Instead, I want the site 
to deploy without any manual intervention.

Lucky for me, GitHub Actions supports
[running jobs on a schedule using cron syntax](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule).
The full script is on the GitHub repo [here](https://github.com/argenthand/thesilverhand.blog/blob/main/.github/workflows/azure-static-web-apps-yellow-bay-0dc02de1e.yml).
Most of the script comes auto-generated from Azure, with my changes being limited to setting up the schedule itself 
and updating the execution check on the `build_and_deploy_job` job. With this, my blog's deployment is fully 
automated to my satisfaction, and the only thing I now need to do is write the content and make sure any articles I 
want to see on the site have a valid date and the `published` flag on their frontmatter.

The implementation isn't perfect, there's a lot of duplicate code that I can clean up, along with some other minor 
improvements, like `process.env.BUILD_DRAFTS` being set to the string "true". I plan to keep refining it to the 
point where I'm satisfied with it, but it's good enough right now for a v1. After all, [perfect is the enemy of 
good](https://en.wikipedia.org/wiki/Perfect_is_the_enemy_of_good).
