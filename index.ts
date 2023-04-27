import {
  fetchUtils,
  DataProvider,
  GET_LIST,
  GET_ONE,
  GET_MANY_REFERENCE,
  CREATE,
  UPDATE,
  DELETE,
} from "react-admin";
export const SingleType = "SingleType";

const raStrapiRest = (apiUrl: string, httpClient = fetchUtils.fetchJson): DataProvider => {
  /**
   * Adjusts the query parameters for Strapi, including sorting, filtering, and pagination.
   * @param params - The input parameters containing pagination, sorting, filtering, target, and ID data.
   * @returns A query string for Strapi with the adjusted parameters.
   */
  const adjustQueryForStrapi = (params: any): string => {
    /* Sample parameters object:
        params = { 
            pagination: { page: {int}, perPage: {int} }, 
            sort: { field: {string}, order: {string} }, 
            filter: {Object}, 
            target: {string}, (REFERENCE ONLY)
            id: {mixed} (REFERENCE ONLY)
        }
      */

    // Handle SORTING
    const s = params.sort;
    const sort =
      s.field === "" ? "sort=updated_at:desc" : "sort=" + s.field + ":" + s.order.toLowerCase();

    // Handle FILTER
    const f = params.filter;
    let filter = "";
    const keys = Object.keys(f);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === "q" && f[keys[i]] !== "") {
        filter += "_q=" + f[keys[i]] + (keys[i + 1] ? "&" : "");
      } else {
        filter += "filters[" + keys[i] + "]_eq=" + f[keys[i]] + (keys[i + 1] ? "&" : "");
      }
    }
    if (params.id && params.target && params.target.indexOf("_id") !== -1) {
      const target = params.target.substring(0, params.target.length - 3);
      filter += "&filters[" + target + "]_eq=" + params.id;
    }

    // Handle PAGINATION
    const { page, perPage } = params.pagination;
    const start = (page - 1) * perPage;
    const pagination = "pagination[start]=" + start + "&pagination[limit]=" + perPage;

    return sort + "&" + pagination + "&" + filter;
  };

  const getUploadFieldNames = (data: any): string[] => {
    if (!data || typeof data !== "object") return [];
    const hasRawFile = (value: any): boolean => {
      return (
        value &&
        typeof value === "object" &&
        ("rawFile" in value ||
          (Array.isArray(value) && value.some(hasRawFile)) ||
          Object.values(value).some(hasRawFile))
      );
    };

    return Object.keys(data).filter((key: any) => hasRawFile(data[key]));
  };

  /**
   * Handles file uploads and data updates for a given resource.
   * @param type - The operation type, either UPDATE or a different value for creating new resources.
   * @param resource - The target resource for the file upload or data update.
   * @param params - The parameters containing the data to be uploaded or updated.
   * @returns The processed response from the server, converted to the appropriate format.
   */
  const handleFileUpload = async (type: any, resource: any, params: any) => {
    const id = type === UPDATE ? `/${params.id}` : "";
    const url = `${apiUrl}/${resource}${params.id == SingleType ? "" : id}`;
    const requestMethod = type === UPDATE ? "PUT" : "POST";
    const formData = new FormData();
    const uploadFieldNames = getUploadFieldNames(params.data);

    const { created_at, updated_at, createdAt, updatedAt, ...data } = params.data;
    uploadFieldNames.forEach((fieldName) => {
      const fieldData = Array.isArray(params.data[fieldName])
        ? params.data[fieldName]
        : [params.data[fieldName]];
      data[fieldName] = fieldData.reduce((acc: any, item: any) => {
        item.rawFile instanceof File
          ? formData.append(`files.${fieldName}`, item.rawFile)
          : acc.push(item.id || item._id);
        return acc;
      }, []);
    });

    formData.append("data", JSON.stringify(data));

    const response = await processRequest(url, { method: requestMethod, body: formData });
    return convertHTTPResponse(response, type, params);
  };

  /**
   * Formats the response from Strapi to react-admin compatible data
   * @param input - The input data to be formatted.
   * @returns The formatted input, either as a single object or an array of objects.
   */
  const formatResponseForRa = (input: any): any => {
    if (!input || input.length === 0) return input;
    const processItem = (item: any) => {
      const json = { id: item.id, ...item.attributes };

      for (const key in json) {
        const { data } = json[key] || {};
        const isArray = Array.isArray(data);
        const isMime = data && (data[0]?.attributes?.mime || data.attributes?.mime);
        if (!data || (isArray && data[0]?.length === 0)) continue;
        const processUrl = (url: string) => `${apiUrl.replace(/\/api$/, "")}${url}`;

        if (isArray && isMime) {
          json[key] = data.map(({ id, attributes }) => ({
            id,
            ...attributes,
            url: processUrl(attributes.url),
          }));
          continue;
        }

        if (!isArray && isMime) {
          json[key] = { id: data.id, ...data.attributes, url: processUrl(data.attributes.url) };
        } else {
          json[key] = isArray ? data.map(({ id }) => id) : data.id.toString();
        }
      }
      return json;
    };

    return Array.isArray(input) ? input.map(processItem) : [processItem(input)][0];
  };

  const convertHTTPResponse = (response: any, type: string, params: any): any => {
    const { json } = response;
    const raData = formatResponseForRa(json.data);
    switch (type) {
      case GET_ONE:
        return { data: raData };
      case GET_LIST:
      case GET_MANY_REFERENCE:
        return {
          data: raData,
          total: json.meta.pagination.total,
        };
      case CREATE:
        return { data: { ...params.data, id: raData.id } };
      case DELETE:
        return { data: { id: null } };
      default:
        return { data: raData };
    }
  };

  const processRequest = async (url: string, options = {}) => {
    const separator = url.includes("?") ? "&" : "?";
    return httpClient(`${url}${separator}populate=*`, options);
  };

  return {
    getList: async (resource: string, params: any) => {
      const url = `${apiUrl}/${resource}?${adjustQueryForStrapi(params)}`;
      const res = await processRequest(url, {});
      return convertHTTPResponse(res, GET_LIST, params);
    },

    getOne: async (resource: string, params: any) => {
      const isSingleType = params.id === SingleType;
      const url = `${apiUrl}/${resource}${isSingleType ? "" : "/" + params.id}`;
      const res = await processRequest(url, {});
      return convertHTTPResponse(res, GET_ONE, params);
    },

    getMany: async (resource: string, params: any) => {
      if (params.ids.length === 0) return { data: [] };
      const ids = params.ids.filter(
        (i: any) => !(typeof i === "object" && i.hasOwnProperty("data") && i.data === null)
      );

      const responses = await Promise.all(
        ids.map((i: any) => {
          return processRequest(`${apiUrl}/${resource}/${i.id || i._id || i}`, {
            method: "GET",
          });
        })
      );
      return {
        data: responses.map((response) => formatResponseForRa(response.json.data)),
      };
    },

    getManyReference: async (resource: string, params: any) => {
      const url = `${apiUrl}/${resource}?${adjustQueryForStrapi(params)}`;
      const res = await processRequest(url, {});
      return convertHTTPResponse(res, GET_MANY_REFERENCE, params);
    },

    update: async (resource: string, params: any) => {
      if (getUploadFieldNames(params.data).length > 0)
        return await handleFileUpload(UPDATE, resource, params);

      const isSingleType = params.id === SingleType;
      const url = `${apiUrl}/${resource}${isSingleType ? "" : "/" + params.id}`;
      const options: any = {};
      options.method = "PUT";
      // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
      const { created_at, updated_at, createdAt, updatedAt, ...data } = params.data;
      options.body = JSON.stringify({ data });

      const res = await processRequest(url, options);
      return convertHTTPResponse(res, UPDATE, params);
    },

    updateMany: async (resource: string, params: any) => {
      const responses = await Promise.all(
        params.ids.map((id: any) => {
          // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
          const { created_at, updated_at, createdAt, updatedAt, ...data } = params.data;
          return processRequest(`${apiUrl}/${resource}/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
          });
        })
      );
      return {
        data: responses.map((response) => formatResponseForRa(response.json.data)),
      };
    },

    create: async (resource: string, params: any) => {
      if (getUploadFieldNames(params.data).length > 0)
        return await handleFileUpload(CREATE, resource, params);

      const url = `${apiUrl}/${resource}`;
      const res = await processRequest(url, {
        method: "POST",
        body: JSON.stringify(params.data),
      });
      return convertHTTPResponse(res, CREATE, { data: params.data });
    },

    delete: async (resource: string, { id }: any) => {
      const url = `${apiUrl}/${resource}${id === SingleType ? "" : `/${id}`}`;
      const res = await processRequest(url, { method: "DELETE" });
      return convertHTTPResponse(res, DELETE, { id });
    },

    deleteMany: async (resource: string, { ids }: any) => {
      const data = await Promise.all(
        ids.map(async (id: any) => {
          const response = await processRequest(`${apiUrl}/${resource}/${id}`, {
            method: "DELETE",
          });
          return formatResponseForRa(response?.json.data);
        })
      );
      return { data };
    },
  };
};

export default raStrapiRest;
