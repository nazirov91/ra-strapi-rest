import {
    fetchUtils,
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    UPDATE_MANY,
    DELETE,
    DELETE_MANY,
} from 'react-admin';
import FormData from 'form-data';

/**
 * Maps react-admin queries to a simple REST API
 *
 * The REST dialect is similar to the one of FakeRest
 * @see https://github.com/marmelab/FakeRest
 * @example
 * GET_LIST     => GET http://my.api.url/posts?sort=['title','ASC']&range=[0, 24]
 * GET_ONE      => GET http://my.api.url/posts/123
 * GET_MANY     => GET http://my.api.url/posts?filter={ids:[123,456,789]}
 * UPDATE       => PUT http://my.api.url/posts/123
 * CREATE       => POST http://my.api.url/posts
 * DELETE       => DELETE http://my.api.url/posts/123
 */
export default (apiUrl, httpClient = fetchUtils.fetchJson) => {
    /**
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The data request params, depending on the type
     * @returns {Object} { url, options } The HTTP request parameters
     */
    const convertDataRequestToHTTP = (type, resource, params) => {
        let url = '';
        const options = {};
        switch (type) {
            case GET_LIST:
            case GET_MANY_REFERENCE:
                switch (resource){
                    case 'upload':
                        url = `${apiUrl}/${resource}/files?${adjustQueryForStrapi(params)}`;
                        break;
                    default:
                        url = `${apiUrl}/${resource}?${adjustQueryForStrapi(params)}`;
                        break;
                }
                break;
            case GET_ONE:
                switch (resource){
                    case 'upload':
                        url = `${apiUrl}/${resource}/files/${params.id}`;
                        break;
                    default:
                        url = `${apiUrl}/${resource}/${params.id}`;
                        break;
                }
                url = `${apiUrl}/${resource}/${params.id}`;
                break;
            case UPDATE:
                url = `${apiUrl}/${resource}/${params.id}`;
                options.method = 'PUT';
                // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
                const {created_at, updated_at, createdAt, updatedAt, ...data} = params.data;
                options.body = JSON.stringify(data);
                break;
            case CREATE:
                url = `${apiUrl}/${resource}`;
                options.method = 'POST';
                options.body = JSON.stringify(params.data);
                break;
            case DELETE:
                switch (resource){
                    case 'upload':
                        url = `${apiUrl}/${resource}/files/${params.id}`;
                        break;
                    default:
                        url = `${apiUrl}/${resource}/${params.id}`;
                        break;
                }
                url = `${apiUrl}/${resource}/${params.id}`;
                options.method = 'DELETE';
                break;
            default:
                throw new Error(`Unsupported fetch action type ${type}`);
        }
        return { url, options };
    };

    const adjustQueryForStrapi = (params) => {

        /*
        params = { 
            pagination: { page: {int} , perPage: {int} }, 
            sort: { field: {string}, order: {string} }, 
            filter: {Object}, 
            target: {string}, (REFERENCE ONLY)
            id: {mixed} (REFERENCE ONLY)
        }
        */

        // Handle SORTING
        const s = params.sort;
        const sort = s.field === "" ? "_sort=updated_at:DESC" : ("_sort=" + s.field + ":" + s.order);

        // Handle FILTER
        const f = params.filter;
        let filter = "";
        const keys = Object.keys(f);
        for(let i = 0; i < keys.length; i++){
            //react-admin uses q filter in several components and strapi use _q
            if (keys[i] === "q" && f[keys[i]] !== '') {
                filter += "_q=" + f[keys[i]] + (keys[i + 1] ? "&" : "")
            } else {
                filter += keys[i] + "=" + f[keys[i]] + (keys[i + 1] ? "&" : "");
            }
        }
        if(params.id && params.target && params.target.indexOf('_id') !== -1){
            const target = params.target.substring(0, params.target.length - 3);
            filter += "&" + target + "=" + params.id;
        }

        // Handle PAGINATION
        const { page, perPage } = params.pagination;
        const start = (page - 1) * perPage;
        const limit = perPage;//for strapi the _limit params indicate the amount of elements to return in the response
        const range = "_start=" + start + "&_limit=" + limit;

        return sort + "&" + range + "&" + filter; 
    }

    /**
     * @param {Object} response HTTP response from fetch()
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The data request params, depending on the type
     * @returns {Object} Data response
     */
    const convertHTTPResponse = (response, type, resource, params) => {
        const { headers, json } = response;
        switch (type) {
            case GET_LIST:
            case GET_MANY_REFERENCE:
                if (!headers.has('content-range')) {
                    throw new Error(
                        'The Content-Range header is missing in the HTTP Response. The simple REST data provider expects responses for lists of resources to contain this header with the total number of results to build the pagination. If you are using CORS, did you declare Content-Range in the Access-Control-Expose-Headers header?'
                    );
                }
                return {
                    data: json,
                    total: parseInt(headers.get('content-range').split('/').pop(), 10)
                };
            case CREATE:
                return { data: { ...params.data, id: json.id } };
            case DELETE:
                return { data: { id: null } };
            default:
                return { data: json };
        }
    };

    const convertFile = file =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            resolve(file.rawFile)
    });

    /**
     * @param {string} type Request type, e.g GET_LIST
     * @param {string} resource Resource name, e.g. "posts"
     * @param {Object} payload Request parameters. Depends on the request type
     * @returns {Promise} the Promise for a data response
     */
    return (type, resource, params) => {
        // simple-rest doesn't handle filters on UPDATE route, so we fallback to calling UPDATE n times instead
        if (type === UPDATE_MANY) {
            return Promise.all(
                params.ids.map(id => {
                    // Omit created_at/updated_at(RDS) and createdAt/updatedAt(Mongo) in request body
                    const {created_at, updated_at, createdAt, updatedAt, ...data} = params.data;
                    return httpClient(`${apiUrl}/${resource}/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(data),
                    })
                })
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }
        // simple-rest doesn't handle filters on DELETE route, so we fallback to calling DELETE n times instead
        if (type === DELETE_MANY) {
            return Promise.all(
                params.ids.map(id =>{
                    switch (resource){
                        case 'upload':
                            url = `${apiUrl}/${resource}/files/${id}`;
                            break;
                        default:
                            url = `${apiUrl}/${resource}/${id}`;
                            break;
                    }
                    return httpClient(url, {
                        method: 'DELETE',
                    })
                }
                )
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }
        //strapi doesn't handle filters in GET route
        if (type === GET_MANY) {
            return Promise.all(
                params.ids.map(id =>
                    httpClient(`${apiUrl}/${resource}/${id}`, {
                        method: 'GET',
                    })
                )
            ).then(responses => ({
                data: responses.map(response => response.json),
            }));
        }

        const { url, options } = convertDataRequestToHTTP(
            type,
            resource,
            params
        );

        // for file uploading
        if (type === CREATE){
            if  (!(
                    (resource === 'upload' && params.data.file)
                )) {
                // fallback to the default implementation
                return httpClient(url, options).then(response =>
                    convertHTTPResponse(response, type, resource, params)
                );
            }

            switch (resource){
                case 'upload':
                    return convertFile(params.data.file)
                    .then(transformed => {
                        var form_data = new FormData();
                        form_data.append('files', transformed)
                        return httpClient(url, {
                            method: "POST",
                            body: form_data,
                        }).then(response =>
                            convertHTTPResponse(response, type, resource, params)
                        );
                    })
                    .catch(err => console.log(err));
            }
        } else {
            return httpClient(url, options).then(response =>
                convertHTTPResponse(response, type, resource, params)
            );
        }
    };
};
