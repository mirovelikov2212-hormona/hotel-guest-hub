const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'components', 'GuestHub.tsx');
if (!fs.existsSync(file)) {
  throw new Error('components/GuestHub.tsx not found. Run this from the project root.');
}

let source = fs.readFileSync(file, 'utf8');
let changed = false;

const exploreOld = `  const exploreSection = hotelAreaSearchQuery
    ? ({
      id: "explore",
      title: String(tUI("explore_title") || "Explore nearby"),
      items: [
        {
          label: String(tUI("attractions_nearby") || "Attractions nearby"),
          kind: "link" as const,
          href: \`https://www.google.com/maps/search/\${encodeURIComponent("tourist attractions within 20 km of " + hotelAreaSearchQuery)}\`,
          newTab: true,
        },
        {
          label: String(tUI("restaurants_nearby") || "Restaurants nearby"),
          kind: "link" as const,
          href: \`https://www.google.com/maps/search/\${encodeURIComponent("restaurants near " + hotelAreaSearchQuery)}\`,
          newTab: true,
        },
        {
          label: String(tUI("pharmacy") || "Pharmacy"),
          kind: "link" as const,
          href: \`https://www.google.com/maps/search/\${encodeURIComponent("pharmacy near " + hotelAreaSearchQuery)}\`,
          newTab: true,
        },
      ],
    } satisfies HubSection)
    : null;
`;

const exploreNew = `  const mapsSearchUrl = (query: string) =>
    \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(query)}\`;

  const nearbyAnchorQuery = hotelAreaSearchQuery || "Hotel Aquamarine Kranevo, Kranevo, Bulgaria";
  const nearbyAttractionsQuery =
    \`landmarks museums historical sites and tourist attractions within 20 km of \${nearbyAnchorQuery}\`;
  const nearbyRestaurantsQuery = \`restaurants near \${nearbyAnchorQuery}\`;
  const nearbyPharmacyQuery = \`pharmacy near \${nearbyAnchorQuery}\`;

  const exploreSection = hotelAreaSearchQuery
    ? ({
      id: "explore",
      title: String(tUI("explore_title") || "Explore nearby"),
      items: [
        {
          label: String(tUI("attractions_nearby") || "Attractions nearby"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyAttractionsQuery),
          newTab: true,
        },
        {
          label: String(tUI("restaurants_nearby") || "Restaurants nearby"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyRestaurantsQuery),
          newTab: true,
        },
        {
          label: String(tUI("pharmacy") || "Pharmacy"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyPharmacyQuery),
          newTab: true,
        },
      ],
    } satisfies HubSection)
    : null;
`;

if (source.includes(exploreOld)) {
  source = source.replace(exploreOld, exploreNew);
  changed = true;
} else if (!source.includes('nearbyAttractionsQuery') && source.includes('tourist attractions within 20 km of ')) {
  source = source.replace(
    /href: `https:\/\/www\.google\.com\/maps\/search\/\$\{encodeURIComponent\("tourist attractions within 20 km of " \+ hotelAreaSearchQuery\)\}`,/,
    'href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("landmarks museums historical sites and tourist attractions within 20 km of " + hotelAreaSearchQuery)}`,'
  );
  changed = true;
}

const reviewOld = `  const reviewsSection = (config.reviews?.google || config.reviews?.tripadvisor || config.reviews?.booking)
    ? ({
      id: "reviews",
      title: withSectionIcon(String(tUI("reviews_title") || "Reviews"), "reviews"),
      items: [
        {
          label: "",
          kind: "info" as const,
          info: reviewIntroLabel,
        },
`;

const reviewNew = `  const reviewIntroText = reviewIntroLabel.replace(/\\?\\s+/, "?\\n");

  const reviewsSection = (config.reviews?.google || config.reviews?.tripadvisor || config.reviews?.booking)
    ? ({
      id: "reviews",
      title: withSectionIcon(String(tUI("reviews_title") || "Reviews"), "reviews"),
      items: [
        {
          label: "",
          kind: "info" as const,
          info: reviewIntroText,
        },
`;

if (source.includes(reviewOld)) {
  source = source.replace(reviewOld, reviewNew);
  changed = true;
} else if (!source.includes('reviewIntroText') && source.includes('info: reviewIntroLabel')) {
  source = source.replace(
    '  const reviewsSection =',
    '  const reviewIntroText = reviewIntroLabel.replace(/\\?\\s+/, "?\\n");\n\n  const reviewsSection ='
  );
  source = source.replace('info: reviewIntroLabel', 'info: reviewIntroText');
  changed = true;
}

if (!changed) {
  console.log('No changes made. The file may already be patched.');
} else {
  fs.writeFileSync(file, source, 'utf8');
  console.log('Patched review intro line break and nearby attractions link. Now run: npm run build');
}
