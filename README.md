# Simple REST Data Provider for React Admin - Strapi

[React Admin](https://marmelab.com/react-admin/) data provider for Strapi.js.

# Strapi V4 Update

### RA-STRAPI-REST works with Strapi V4 now. 🚀

If you want to use the version compatible with Strapi V3 check the following [release code](https://github.com/nazirov91/ra-strapi-rest/releases/tag/0.1.2).

Also, it is converted to TypeScript.

### Check out this demo for reference => [Demo](https://github.com/nazirov91/ra-strapi-rest-demo)

- [x] Works with Single Types
- [x] Works with Collection types
- [x] Works with Components
- [x] Handles single and multiple Media files
- [x] Handles basic filtering
- [x] Handles sorting and pagination
- [x] Works with reference fields/inputs under community version
- [x] Tested with Sqlite and Postgres

# Usage

Save the **index.ts** file as `ra-strapi-rest.ts` and import it in your react-admin project. No need to npm install another dependency :)

```tsx
// App.tsx

import raStrapiRest from "./ra-strapi-rest";
```

If you prefer to add this to node modules, go ahead and run the following command

```
npm install ra-strapi-rest
```

or

```
yarn add ra-strapi-rest
```

Then import it in your `App.tsx` as usual

```tsx
import raStrapiRest from "ra-strapi-rest";
```

# Example

```tsx
import { fetchUtils, Admin, Resource } from "react-admin";
import { ArticleList } from "./pages/articles/articleList";
import { AppLayout } from "./Layout";
import raStrapiRest from "./ra-strapi-rest";

const strapiApiUrl = "http://localhost:1337/api";

const httpClient = (url: string, options: any = {}) => {
  options.headers = options.headers || new Headers({ Accept: "application/json" });
  options.headers.set("Authorization", `Bearer ${import.meta.env.VITE_STRAPI_API_TOKEN}`);
  return fetchUtils.fetchJson(url, options);
};

export const dataProvider = raStrapiRest(strapiApiUrl, httpClient);

const App = () => (
  <Admin layout={AppLayout} dataProvider={dataProvider}>
    <Resource name="articles" list={ArticleList} />
  </Admin>
);

export default App;
```

ArticleList Component:

```tsx
import { List, Datagrid, TextField } from "react-admin";

export const ArticleList = () => (
  <List hasCreate hasEdit filters={articleFilters}>
    <Datagrid rowClick="show">
      <TextField source="title" />
      <TextField source="published_date" label="Publish date" />
    </Datagrid>
  </List>
);
```

### Check out this demo for detailed reference => [Demo](https://github.com/nazirov91/ra-strapi-rest-demo)
