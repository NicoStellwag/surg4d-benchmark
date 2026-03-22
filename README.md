# Surg4D Annotations and Annotation Tool

This repository contains the official annotations and annotation tool for our
project Surg4D. You only need this if you want to annotate your own queries.
For everything else, check our [main project repository](https://github.com/tum-ai/surg4d).

### Setup
1. Download CholecSeg8k dataset
    ```bash
    # download
    curl -L -o ./cholecseg8k.zip \
     https://www.kaggle.com/api/v1/datasets/download/newslab/cholecseg8k

    # unzip
    unzip ./cholecseg8k.zip -d cholecseg8k
    ```

2. Prepare clips for annotation
    ```bash
    # configure cholecseg8k clips in config.yaml
    pixi run python prepare_for_annotation.py
    ```

3. Start annotating with the web tool
    ```bash
    pixi run python annotation_tool/app.py

    # then forward the port and open localhost:8080
    ```

4. Optional: Sanity check spatial annotations
    ```bash
    pixi run python dump_spatial.py
    ```

### Annotation tool usage
- Move between frames with left and right arrow keys (or using time slider)
- Add ranges by holding shift while moving frames