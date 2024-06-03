const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const {UTCDate} = require("@date-fns/utc");
const {isFuture, format} = require("date-fns");

function processArticles(collectionApi) {
  return collectionApi.getFilteredByTag("articles")
    .filter(function (article) {
      if (process.env.SHOW_ARTICLES === "all") return true;
      const articleDateUtc = new UTCDate(article.data.date);
      return "published" in article.data && article.data?.published && !isFuture(articleDateUtc);
    })
    .sort(function (a, b) {
      return b.date - a.date;
    });
}

module.exports = function (config) {
  config.amendLibrary("md", (mdLib) => mdLib.enable("code"));

  // plugins
  config.addPlugin(syntaxHighlight);

  // copy assets, media files, scripts
  config.addPassthroughCopy("src/assets");

  // filters
  config.addFilter("readableDate", function (value) {
    return format(new UTCDate(value), "MMM d, y");
  });
  config.addFilter("filterTagList", function filterTagList(tags) {
    return (tags || []).filter(tag => ["article", "articles", "nav", "all"].indexOf(tag) === -1);
  });
  config.addFilter("inFuture", function (value) {
    return isFuture(new UTCDate(value));
  });

  // shortcodes
  config.addShortcode("fullYear", function () {
    return new Date().getFullYear();
  });

  // collections
  config.addCollection("articles", function (collectionApi) {
    return processArticles(collectionApi);
  });
  config.addCollection("latestArticles", function (collectionApi) {
    return processArticles(collectionApi).slice(0, 9);
  });

  if (process.env.ELEVENTY_RUN_MODE === "serve") {
    process.env.SHOW_ARTICLES = "all";
  }

  return {
    dir: {
      input: "src",
      output: "dist"
    },
    markdownTemplateEngine: "njk"
  }
}
