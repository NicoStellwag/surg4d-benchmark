# endo4d

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

### Annotation tool usage
- move between frames with left and right arrow keys (or using time slider)
- add ranges by holding shift while moving frames