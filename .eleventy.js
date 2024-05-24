const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const {DateTime} = require('luxon');

module.exports = function (config) {
  config.amendLibrary("md", (mdLib) => mdLib.enable("code"));

  // plugins
  config.addPlugin(syntaxHighlight);

  // copy assets, media files, scripts
  config.addPassthroughCopy("src/assets");

  // filters
  config.addFilter("readableDate", function (value) {
    const date = DateTime.fromJSDate(value, {zone: "UTC"});
    return date.toLocaleString(DateTime.DATE_MED);
  });
  config.addFilter("filterTagList", function filterTagList(tags) {
    return (tags || []).filter(tag => ["article", "articles", "nav", "all"].indexOf(tag) === -1);
  });
  config.addFilter("isDateInFuture", function (value) {
    const date = DateTime.fromJSDate(value, {zone: "UTC"});
    const now = DateTime.utc();
    return date > now;
  });

  // shortcodes
  config.addShortcode("fullYear", function () {
    return new Date().getFullYear();
  });

  // collections
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
  config.addCollection("latestArticles", function (collectionApi) {
    return collectionApi.getFilteredByTag("articles")
      .filter(function (article) {
        if (process.env.BUILD_DRAFTS === "true") return true;
        const now = DateTime.utc();
        const articleDate = DateTime.fromJSDate(article.data.date, {zone: "UTC"});
        return "published" in article.data && article.data?.published && now >= articleDate;
      })
      .sort(function (a, b) {
        return b.date - a.date;
      }).slice(0, 9);
  });

  if (process.env.ELEVENTY_RUN_MODE === "serve") {
    process.env.BUILD_DRAFTS = "true";
  }

  return {
    dir: {
      input: "src",
      output: "dist"
    },
    markdownTemplateEngine: "njk"
  }
}
